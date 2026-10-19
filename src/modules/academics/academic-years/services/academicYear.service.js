import { and, count, eq, gt, gte, lte, ne, sql } from "drizzle-orm";
import { cache } from "../../../../common/cache/cache.js";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { studentEnrollments as enrollments } from "../../enrollments/models/enrollment.schema.js";
import { PREVIOUS_YEAR_GRACE_MONTHS } from "../../shared/constants/academic.constants.js";
import { academicYears } from "../models/academicYear.schema.js";
import { academicYearRepository } from "../repositories/academicYear.repository.js";
import { yearDatesProblem, yearNameFor } from "../utils/yearName.util.js";

const base = createCrudService(academicYearRepository, { entity: "Academic year" });

/* The current year is read on almost every academic request */
const CURRENT_TTL_SECONDS = 300;
const currentKey = tenantId => `tenant:${tenantId}:academics:currentYear`;
const forgetCurrent = tenantId => cache.del(currentKey(tenantId));

/* Run a write, then drop the cached current year (after commit, so readers never re-cache stale data) */
const changing = async (ctx, work) => {
  const result = await transaction(work);
  await forgetCurrent(ctx.tenantId);
  return result;
};

const lockYear = async (ctx, academicYearId, tx) => {
  const [year] = await tx
    .select()
    .from(academicYears)
    .where(
      and(
        eq(academicYears.tenantId, ctx.tenantId),
        eq(academicYears.id, academicYearId),
        eq(academicYears.isActive, true)
      )
    )
    .for("update");
  if (!year) throw notFound("Academic year");
  return year;
};

/* A year's name comes from its dates, and no two years of a school share a day.
   Serialised per school (advisory lock), so two requests cannot both pass the check.
   -> the name to store */
const settleDates = async (ctx, tx, { startDate, endDate, yearName }, exceptId) => {
  const problem = yearDatesProblem(startDate, endDate);
  if (problem) throw unprocessable(problem);
  const derived = yearNameFor(startDate, endDate);
  if (yearName !== undefined && yearName !== derived) {
    throw unprocessable(
      `yearName must be ${derived} for ${startDate} to ${endDate}: it is derived from the dates. Leave it out.`
    );
  }

  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`academic-years:${ctx.tenantId}`}, 0))`);
  const [other] = await tx
    .select()
    .from(academicYears)
    .where(
      and(
        eq(academicYears.tenantId, ctx.tenantId),
        eq(academicYears.isActive, true),
        lte(academicYears.startDate, endDate),
        gte(academicYears.endDate, startDate),
        exceptId ? ne(academicYears.id, exceptId) : undefined
      )
    )
    .limit(1);
  if (other) {
    throw conflict(
      `${startDate} to ${endDate} overlaps academic year ${other.yearName} (${other.startDate} to ${other.endDate}). Academic years cannot overlap.`
    );
  }
  return derived;
};

export const academicYearService = {
  list: base.list,
  getById: base.getById,

  getCurrent: async ctx => {
    const year = await academicYearService.findCurrent(ctx);
    if (!year) throw notFound("Current academic year");
    return year;
  },

  /* Marking a year current un-marks the previous one in the same transaction */
  create: (ctx, data) =>
    changing(ctx, async tx => {
      const yearName = await settleDates(ctx, tx, data);
      if (data.isCurrent) await academicYearRepository.clearCurrent(ctx.tenantId, null, { dbc: tx });
      return academicYearRepository.create(ctx.tenantId, { ...data, yearName }, { dbc: tx });
    }),

  update: (ctx, academicYearId, data) =>
    changing(ctx, async tx => {
      const existing = await academicYearRepository.findById(ctx.tenantId, academicYearId, { dbc: tx });
      if (!existing) throw notFound("Academic year");

      /* New dates re-derive the name. Sending yearName alone renames a year named
         before names were derived (it must be the name its dates give). */
      const renaming = ["startDate", "endDate", "yearName"].some(field => data[field] !== undefined);
      if (renaming && existing.archivedAt) {
        throw conflict(`Academic year ${existing.yearName} is archived and read-only. Restore it first.`);
      }
      const named = renaming
        ? {
            yearName: await settleDates(
              ctx,
              tx,
              {
                startDate: data.startDate ?? existing.startDate,
                endDate: data.endDate ?? existing.endDate,
                yearName: data.yearName
              },
              academicYearId
            )
          }
        : {};

      if (data.isCurrent) await academicYearRepository.clearCurrent(ctx.tenantId, academicYearId, { dbc: tx });
      /* Becoming current again ends any grace; stopping being current starts it */
      const since =
        data.isCurrent === true
          ? { currentUntil: null }
          : data.isCurrent === false && existing.isCurrent
            ? { currentUntil: new Date() }
            : {};
      return academicYearRepository.update(ctx.tenantId, academicYearId, { ...data, ...named, ...since }, { dbc: tx });
    }),

  /* Freeze a finished year: its academic records become read-only.
     Fees are not frozen, so arrears stay payable. */
  archive: (ctx, academicYearId) =>
    changing(ctx, async tx => {
      const year = await lockYear(ctx, academicYearId, tx);
      if (year.archivedAt) throw conflict(`Academic year ${year.yearName} is already archived`);
      if (year.isCurrent) throw unprocessable(`${year.yearName} is the current year. Make another year current first.`);
      const today = await tenantToday(ctx.tenantId);
      if (year.endDate >= today) {
        throw unprocessable(`${year.yearName} ends on ${year.endDate}. Archive it after it has ended.`);
      }
      /* Once archived, enrollments cannot be closed or promoted, so finish year-end first */
      const [{ active }] = await tx
        .select({ active: count() })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.tenantId, ctx.tenantId),
            eq(enrollments.academicYearId, academicYearId),
            eq(enrollments.isActive, true),
            eq(enrollments.status, "ACTIVE")
          )
        );
      if (active > 0) {
        throw unprocessable(
          `${active} student${active === 1 ? " is" : "s are"} still active in ${year.yearName}. Promote them or mark them as left first.`
        );
      }
      return academicYearRepository.update(ctx.tenantId, academicYearId, { archivedAt: new Date() }, { dbc: tx });
    }),

  /* Make an archived year editable again (e.g. to correct a mark) */
  restore: (ctx, academicYearId) =>
    changing(ctx, async tx => {
      const year = await lockYear(ctx, academicYearId, tx);
      if (!year.archivedAt) throw conflict(`Academic year ${year.yearName} is not archived`);
      return academicYearRepository.update(ctx.tenantId, academicYearId, { archivedAt: null }, { dbc: tx });
    }),

  /* For writes that the archive triggers cannot see (files in storage) */
  assertWritable: async (ctx, academicYearId) => {
    const year = await academicYearRepository.findById(ctx.tenantId, academicYearId);
    if (year?.archivedAt) throw conflict(`Academic year ${year.yearName} is archived and read-only`);
  },

  /* For other submodules: null when missing */
  findById: (ctx, academicYearId) => academicYearRepository.findById(ctx.tenantId, academicYearId),
  findCurrent: ctx =>
    cache.wrap(currentKey(ctx.tenantId), CURRENT_TTL_SECONDS, async () =>
      academicYearRepository.findOne(ctx.tenantId, [eq(academicYears.isCurrent, true)])
    ),

  /* The year that stopped being current less than PREVIOUS_YEAR_GRACE_MONTHS ago (or null):
     its teachers keep it for that long */
  findInGrace: async ctx => {
    const since = new Date();
    since.setMonth(since.getMonth() - PREVIOUS_YEAR_GRACE_MONTHS);
    return academicYearRepository.findOne(ctx.tenantId, [
      eq(academicYears.isCurrent, false),
      gt(academicYears.currentUntil, since)
    ]);
  }
};
