import { transaction } from "../../../../common/database/postgres.js";
import { conflict, forbidden, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { periodService } from "../../timetable/index.js";
import {
  attendanceFreePeriodRepository,
  attendancePolicyRepository,
  attendanceSessionRepository
} from "../repositories/attendance.repository.js";
import {
  checkLock,
  closureOf,
  loadSection,
  periodOf,
  policyForWrite,
  registerLabel,
  sectionLabel
} from "./attendance.service.js";
import { MODE_TEXT, attendanceModeService } from "./attendanceMode.service.js";

/* Free (leisure) periods: on a period-wise day the period's teacher is away and no
   teacher of the section covers it. Marked by the section's class teacher or deputy, or
   ADMIN/PRINCIPAL. A free period has no register: it is never a missing register and
   counts in nobody's attendance. The edit-window lock (D-08) applies as to registers. */

/* The section's class teacher or deputy; ADMIN/PRINCIPAL: any */
const assertManager = async (ctx, section) => {
  await teachingScope.assertSection(ctx, section.id);
  if (await teachingScope.leadsSection(ctx, section.id)) return;
  throw forbidden(
    `Only the class teacher of ${sectionLabel(section)}, its deputy, ADMIN or PRINCIPAL can mark its periods free`
  );
};

/* The bell-schedule names of the rows' periods: Map("yearId|n" -> "Period 2") */
const periodNames = async (ctx, rows) => {
  const years = [...new Set(rows.map(row => row.academicYearId))];
  const periods = (await Promise.all(years.map(year => periodService.findAllInYear(ctx, year)))).flat();
  return new Map(periods.map(period => [`${period.academicYearId}|${period.periodNumber}`, period.name]));
};

/* -> { id, section, date, periodNumber, label, reason, markedBy, markedAt, lockOverride } */
const view = (row, section, names) => ({
  id: row.id,
  section: { id: section.id, label: sectionLabel(section) },
  date: row.date,
  periodNumber: row.periodNumber,
  label: registerLabel({
    kind: "PERIOD",
    periodNumber: row.periodNumber,
    periodName: names.get(`${row.academicYearId}|${row.periodNumber}`)
  }),
  reason: row.reason,
  markedBy: row.markedBy,
  markedAt: row.markedAt,
  lockOverride: row.lockOverriddenAt
    ? { reason: row.lockOverrideReason, by: row.lockOverriddenBy, at: row.lockOverriddenAt }
    : null
});

export const freePeriodService = {
  /* Mark a period free (again: change its reason). -> { freePeriod, created } */
  mark: async (ctx, { sectionId, date, periodNumber, reason, overrideReason }) => {
    const { section, academicYear } = await loadSection(ctx, sectionId);
    await assertManager(ctx, section);
    const period = await periodOf(ctx, section, periodNumber);
    const label = sectionLabel(section);

    const today = await tenantToday(ctx.tenantId);
    if (date > today) throw unprocessable("A period cannot be marked free for a future date");
    const closure = await closureOf(ctx, academicYear, date);
    if (closure) throw unprocessable(`${period.name} cannot be marked free on ${date}: it is ${closure}`);

    const { id: policyId } = await attendancePolicyRepository.ensure(ctx.tenantId);
    const result = await transaction(async tx => {
      const policy = await policyForWrite(ctx, policyId, date, today, tx);
      const mode = await attendanceModeService.modeOn(ctx, date, { dbc: tx });
      if (mode !== "PERIOD_WISE") {
        throw unprocessable(
          `On ${date} the school takes attendance ${MODE_TEXT[mode]}: only periods of period-wise days can be marked free`
        );
      }
      /* A trigger holds the same line against a register taken meanwhile */
      const at = { sectionId, date, periodNumber };
      if (await attendanceSessionRepository.periodTaken(ctx.tenantId, at, { dbc: tx })) {
        throw conflict(
          `The ${period.name} register of ${label} on ${date} was already taken: a period with a register cannot be marked free`
        );
      }
      const override = checkLock(ctx, policy, date, today, overrideReason);
      const existing = await attendanceFreePeriodRepository.findAt(ctx.tenantId, at, { dbc: tx });
      const { id } = await attendanceFreePeriodRepository.upsert(
        ctx.tenantId,
        {
          academicYearId: academicYear.id,
          sectionId,
          date,
          periodNumber,
          reason,
          markedBy: ctx.userId,
          lockOverrideReason: override?.lockOverrideReason ?? null,
          lockOverriddenBy: override?.lockOverriddenBy ?? null,
          lockOverriddenAt: override?.lockOverriddenAt ?? null
        },
        { dbc: tx }
      );
      return { id, created: !existing };
    });

    const row = await attendanceFreePeriodRepository.findById(ctx.tenantId, result.id);
    return { created: result.created, freePeriod: view(row, section, await periodNames(ctx, [row])) };
  },

  /* Free periods by date and bell order (filters: section, from/to). A teacher sees their sections'. */
  list: async (ctx, { sectionId, from, to, page, limit }) => {
    if (sectionId) await teachingScope.assertSection(ctx, sectionId);
    const inScope = sectionId ? [sectionId] : await teachingScope.sectionIds(ctx);
    const { rows, meta } = await attendanceFreePeriodRepository.list(ctx.tenantId, {
      conditions: attendanceFreePeriodRepository.filters({ sectionIds: inScope, from, to }),
      page,
      limit,
      with: { section: { with: { class: { columns: { className: true } } } } }
    });
    const names = await periodNames(ctx, rows);
    return { rows: rows.map(row => view(row, row.section, names)), meta };
  },

  /* Remove a free period, so the period's register can be taken. -> the removed free period */
  remove: async (ctx, freePeriodId, { overrideReason }) => {
    const row = await attendanceFreePeriodRepository.findById(ctx.tenantId, freePeriodId);
    if (!row) throw notFound("Free period");
    const { section } = await loadSection(ctx, row.sectionId);
    await assertManager(ctx, section);

    const today = await tenantToday(ctx.tenantId);
    const { id: policyId } = await attendancePolicyRepository.ensure(ctx.tenantId);
    const removed = await transaction(async tx => {
      const policy = await policyForWrite(ctx, policyId, row.date, today, tx);
      const override = checkLock(ctx, policy, row.date, today, overrideReason);
      return attendanceFreePeriodRepository.update(ctx.tenantId, row.id, { isActive: false, ...override }, { dbc: tx });
    });
    if (!removed) throw notFound("Free period");
    return view(removed, section, await periodNames(ctx, [removed]));
  }
};
