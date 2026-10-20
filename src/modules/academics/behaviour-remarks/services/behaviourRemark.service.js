import { desc, eq, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";
import { publish } from "../../../../common/events/events.js";
import { forbidden, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { enrollmentService } from "../../enrollments/index.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { REMARK_KINDS } from "../constants/behaviourRemark.constants.js";
import { behaviourRemarks } from "../models/behaviourRemark.schema.js";
import { behaviourRemarkRepository } from "../repositories/behaviourRemark.repository.js";

export const BEHAVIOUR_REMARK_RECORDED = "academics.behaviourRemark.recorded";

const PERSON = { columns: { id: true, firstName: true, lastName: true, role: true } };
const WITH = {
  student: { columns: { id: true, admissionNumber: true, studentCode: true }, with: { user: { columns: { firstName: true, lastName: true } } } },
  recorder: PERSON,
  acknowledger: PERSON
};

const canChange = (ctx, remark) => ROLE_GROUPS.MANAGEMENT.includes(ctx.role) || remark.recordedBy === ctx.userId;

const view = (ctx, remark) => ({ ...remark, canEdit: canChange(ctx, remark) });

/* A teacher reads remarks recorded in the sections they teach, and the ones they wrote
   (null = no restriction) */
const visibility = async ctx => {
  const sectionIds = await teachingScope.sectionIds(ctx);
  if (sectionIds === null) return null;
  const mine = eq(behaviourRemarks.recordedBy, ctx.userId);
  return sectionIds.length ? or(inArray(behaviourRemarks.sectionId, sectionIds), mine) : mine;
};

const filters = ({ studentId, sectionId, kind, category, from, to, unacknowledged }) =>
  [
    studentId && eq(behaviourRemarks.studentId, studentId),
    sectionId && eq(behaviourRemarks.sectionId, sectionId),
    kind && eq(behaviourRemarks.kind, kind),
    category && eq(behaviourRemarks.category, category),
    from && gte(behaviourRemarks.occurredOn, from),
    to && lte(behaviourRemarks.occurredOn, to),
    unacknowledged === true && isNull(behaviourRemarks.acknowledgedAt),
    unacknowledged === false && isNotNull(behaviourRemarks.acknowledgedAt)
  ].filter(Boolean);

/* Newest first: the day it happened, then when it was written */
const ORDER = [desc(behaviourRemarks.occurredOn), desc(behaviourRemarks.createdAt)];

const listWhere = (ctx, conditions, { page, limit }) =>
  behaviourRemarkRepository.list(ctx.tenantId, { page, limit, with: WITH, orderBy: ORDER, conditions });

/* In the year, and not in the future */
const assertDate = async (ctx, occurredOn, year) => {
  if (occurredOn > (await tenantToday(ctx.tenantId))) throw unprocessable("occurredOn cannot be in the future");
  if (occurredOn < year.startDate || occurredOn > year.endDate)
    throw unprocessable(`occurredOn must be within ${year.yearName} (${year.startDate} to ${year.endDate})`);
};

const loadVisible = async (ctx, remarkId) => {
  const where = await visibility(ctx);
  const remark = await behaviourRemarkRepository.findOne(
    ctx.tenantId,
    [eq(behaviourRemarks.id, remarkId), where].filter(Boolean),
    { with: WITH }
  );
  if (!remark) throw notFound("Behaviour remark");
  return remark;
};

const loadForChange = async (ctx, remarkId) => {
  const remark = await loadVisible(ctx, remarkId);
  if (!canChange(ctx, remark)) throw forbidden("Only the teacher who wrote this remark, the principal or an admin can change it");
  return remark;
};

const summaryOf = rows => {
  const counts = Object.fromEntries(REMARK_KINDS.map(kind => [kind, 0]));
  let unacknowledged = 0;
  let lastOn = null;
  for (const row of rows) {
    counts[row.kind] = row.count;
    unacknowledged += row.unacknowledged;
    if (row.lastOn && (!lastOn || row.lastOn > lastOn)) lastOn = row.lastOn;
  }
  return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0), unacknowledged, lastOn };
};

export const behaviourRemarkService = {
  /* Year-scoped (the X-Academic-Year-Id year). Teachers: their sections and their own remarks. */
  list: async (ctx, query) => {
    const where = await visibility(ctx);
    const result = await listWhere(
      ctx,
      [eq(behaviourRemarks.academicYearId, ctx.academicYearId), where, ...filters(query)].filter(Boolean),
      query
    );
    return { ...result, rows: result.rows.map(r => view(ctx, r)) };
  },

  /* A student's year in numbers, counting only what the caller may read */
  summary: async (ctx, studentId) => {
    const where = await visibility(ctx);
    const rows = await behaviourRemarkRepository.summary(
      ctx.tenantId,
      [eq(behaviourRemarks.academicYearId, ctx.academicYearId), eq(behaviourRemarks.studentId, studentId), where].filter(Boolean)
    );
    return summaryOf(rows);
  },

  getById: async (ctx, remarkId) => view(ctx, await loadVisible(ctx, remarkId)),

  /* Recorded against the student's section in the year: they must be enrolled in it */
  create: async (ctx, { studentId, occurredOn, kind, category, remark, actionTaken }) => {
    const year = ctx.academicYear;
    const enrollment = await enrollmentService.findForStudent(ctx, studentId, year.id);
    if (!enrollment) throw unprocessable(`The student is not enrolled in ${year.yearName}`);
    if (enrollment.status !== "ACTIVE") throw unprocessable("The student has left the school this year");
    await assertDate(ctx, occurredOn, year);
    const created = await behaviourRemarkRepository.create(ctx.tenantId, {
      academicYearId: year.id,
      studentId,
      sectionId: enrollment.sectionId,
      occurredOn,
      kind,
      category,
      remark,
      actionTaken: actionTaken || null,
      recordedBy: ctx.userId
    });
    await publish(BEHAVIOUR_REMARK_RECORDED, { tenantId: ctx.tenantId, remarkId: created.id });
    return behaviourRemarkService.getById(ctx, created.id);
  },

  /* A changed entry is shown to the parents again as not yet acknowledged */
  update: async (ctx, remarkId, data) => {
    const remark = await loadForChange(ctx, remarkId);
    if (data.occurredOn) await assertDate(ctx, data.occurredOn, ctx.academicYear);
    if (remark.academicYearId !== ctx.academicYearId)
      throw unprocessable("This remark belongs to another academic year; switch to that year to change it");
    const changes = { ...data, acknowledgedAt: null, acknowledgedBy: null };
    if (data.actionTaken !== undefined) changes.actionTaken = data.actionTaken || null;
    await behaviourRemarkRepository.update(ctx.tenantId, remarkId, changes);
    return behaviourRemarkService.getById(ctx, remarkId);
  },

  remove: async (ctx, remarkId) => {
    const remark = await loadForChange(ctx, remarkId);
    if (remark.academicYearId !== ctx.academicYearId)
      throw unprocessable("This remark belongs to another academic year; switch to that year to remove it");
    await behaviourRemarkRepository.softDelete(ctx.tenantId, remarkId);
  },

  /* For the portal: the whole log of one student (the caller's access is checked there) */
  forStudent: (ctx, studentId, query) =>
    listWhere(
      ctx,
      [eq(behaviourRemarks.academicYearId, ctx.academicYearId), eq(behaviourRemarks.studentId, studentId), ...filters(query)],
      query
    ),

  summaryForStudent: async (ctx, studentId) =>
    summaryOf(
      await behaviourRemarkRepository.summary(ctx.tenantId, [
        eq(behaviourRemarks.academicYearId, ctx.academicYearId),
        eq(behaviourRemarks.studentId, studentId)
      ])
    ),

  /* A parent's signature on the entry; repeating it keeps the first */
  acknowledge: async (ctx, studentId, remarkId) => {
    const remark = await behaviourRemarkRepository.findOne(ctx.tenantId, [
      eq(behaviourRemarks.id, remarkId),
      eq(behaviourRemarks.studentId, studentId)
    ]);
    if (!remark) throw notFound("Behaviour remark");
    if (!remark.acknowledgedAt)
      await behaviourRemarkRepository.update(ctx.tenantId, remarkId, { acknowledgedAt: new Date(), acknowledgedBy: ctx.userId }, {
        conditions: [isNull(behaviourRemarks.acknowledgedAt)]
      });
    const row = await behaviourRemarkRepository.findById(ctx.tenantId, remarkId, { with: WITH });
    return { remark: row, already: Boolean(remark.acknowledgedAt) };
  },

  /* For the notification subscriber */
  findById: (ctx, remarkId) => behaviourRemarkRepository.findOne(ctx.tenantId, [eq(behaviourRemarks.id, remarkId)], { with: WITH })
};
