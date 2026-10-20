import { desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { publish } from "../../../../common/events/events.js";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, forbidden, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { addDays, daysBetween } from "../../../../common/utils/date.util.js";
import { academicYearService } from "../../academic-years/index.js";
import { attendanceService } from "../../attendance/index.js";
import { calendarService } from "../../calendar/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { lockKey } from "../../shared/utils/locks.util.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { EXCUSED_KINDS, MAX_LEAVE_SPAN_DAYS } from "../constants/studentLeave.constants.js";
import { studentLeaveRequests as leaves } from "../models/studentLeave.schema.js";
import { studentLeaveRepository } from "../repositories/studentLeave.repository.js";

export const STUDENT_LEAVE_REQUESTED = "academics.studentLeave.requested";
export const STUDENT_LEAVE_DECIDED = "academics.studentLeave.decided";
export const STUDENT_LEAVE_CANCELLED = "academics.studentLeave.cancelled";

const PERSON = { columns: { id: true, firstName: true, lastName: true, role: true } };
const WITH = {
  student: {
    columns: { id: true, admissionNumber: true, studentCode: true },
    with: { user: { columns: { firstName: true, lastName: true } } }
  },
  section: { columns: { id: true, sectionName: true }, with: { class: { columns: { id: true, className: true } } } },
  requester: PERSON,
  decider: PERSON,
  canceller: PERSON
};

/* Newest days first, then the latest application */
const ORDER = [desc(leaves.fromDate), desc(leaves.createdAt)];

const word = status => status.toLowerCase();
const span = ({ fromDate, toDate }) => (fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`);

/* The class teacher or deputy of the student's section; the principal and admins anywhere */
const canDecide = (ctx, leave) => teachingScope.leadsSection(ctx, leave.sectionId);

const staffView = async (ctx, leave) => ({
  ...leave,
  canDecide: leave.status === "PENDING" && (await canDecide(ctx, leave))
});

/* A parent cancels while it is pending, or approved and not started yet */
const cancellable = (leave, today) =>
  leave.status === "PENDING" || (leave.status === "APPROVED" && leave.fromDate > today);

/* A teacher reads requests of the sections they teach (null = no restriction) */
const visibility = async ctx => {
  const sectionIds = await teachingScope.sectionIds(ctx);
  if (sectionIds === null) return null;
  return sectionIds.length ? inArray(leaves.sectionId, sectionIds) : sql`false`;
};

const filters = ({ status, studentId, sectionId, from, to }) =>
  [
    status && eq(leaves.status, status),
    studentId && eq(leaves.studentId, studentId),
    sectionId && eq(leaves.sectionId, sectionId),
    from && gte(leaves.toDate, from),
    to && lte(leaves.fromDate, to)
  ].filter(Boolean);

/* Pending requests of the year the caller decides: a teacher, those of the sections they lead */
const pendingFor = async ctx => {
  const scope = await teachingScope.of(ctx);
  const leads = scope && [...scope.classTeacherOf, ...scope.deputyOf];
  if (leads && !leads.length) return 0;
  return studentLeaveRepository.count(
    ctx.tenantId,
    [
      eq(leaves.academicYearId, ctx.academicYearId),
      eq(leaves.status, "PENDING"),
      leads && inArray(leaves.sectionId, leads)
    ].filter(Boolean)
  );
};

const loadVisible = async (ctx, requestId) => {
  const where = await visibility(ctx);
  const leave = await studentLeaveRepository.findOne(ctx.tenantId, [eq(leaves.id, requestId), where].filter(Boolean), {
    with: WITH
  });
  if (!leave) throw notFound("Leave request");
  return leave;
};

const load = (ctx, requestId) => studentLeaveRepository.findById(ctx.tenantId, requestId, { with: WITH });

/* The school days a request takes (weekly offs and holidays left out) */
const schoolDays = async (ctx, year, { fromDate, toDate }) =>
  (await calendarService.workingDays(ctx, year, fromDate, toDate)).workingDays;

/* The year the days fall in, open for writing, with the request inside it */
const yearFor = async (ctx, { fromDate, toDate }) => {
  const year = await academicYearService.findContaining(ctx, fromDate);
  if (!year) throw unprocessable(`${fromDate} is not in any academic year of the school`);
  if (toDate > year.endDate) {
    throw unprocessable(
      `${year.yearName} ends on ${year.endDate}: apply up to that day, and separately for the days after it`
    );
  }
  if (year.archivedAt) throw conflict(`Academic year ${year.yearName} is archived and read-only`);
  return year;
};

/* Past days: while that day's attendance can still be changed (the school's edit window) */
const assertNotTooLate = async (ctx, fromDate) => {
  const [today, window] = await Promise.all([tenantToday(ctx.tenantId), attendanceService.editWindowDays(ctx)]);
  const earliest = addDays(today, -window);
  if (fromDate < earliest) {
    throw unprocessable(
      window
        ? `Leave for past days can be applied up to ${window} day${window === 1 ? "" : "s"} back (from ${earliest}). For earlier days, please speak to the class teacher.`
        : "Leave can be applied from today on. For earlier days, please speak to the class teacher."
    );
  }
};

export const studentLeaveService = {
  /* Year-scoped (the X-Academic-Year-Id year). Teachers: the sections they teach. */
  list: async (ctx, query) => {
    const where = await visibility(ctx);
    const result = await studentLeaveRepository.list(ctx.tenantId, {
      page: query.page,
      limit: query.limit,
      with: WITH,
      orderBy: ORDER,
      conditions: [eq(leaves.academicYearId, ctx.academicYearId), where, ...filters(query)].filter(Boolean)
    });
    return {
      rows: await Promise.all(result.rows.map(row => staffView(ctx, row))),
      /* pending: waiting for the caller's decision in the year, whatever the filters */
      meta: { ...result.meta, pending: await pendingFor(ctx) }
    };
  },

  getById: async (ctx, requestId) => staffView(ctx, await loadVisible(ctx, requestId)),

  /* For the register: the section's students with a pending or approved leave on `date` */
  onLeave: async (ctx, { sectionId, date }) => {
    await teachingScope.assertSection(ctx, sectionId);
    const roster = await enrollmentService.findRoster(ctx, sectionId);
    if (!roster.length) return [];
    const rows = await studentLeaveRepository.covering(ctx.tenantId, {
      studentIds: roster.map(e => e.studentId),
      date,
      statuses: ["PENDING", "APPROVED"]
    });
    return rows.map(({ id, studentId, status, session, reasonCategory, fromDate, toDate }) => ({
      requestId: id,
      studentId,
      status,
      session,
      reasonCategory,
      fromDate,
      toDate
    }));
  },

  /* Approving excuses the absences already marked on those days (later registers show the
     leave, and the teacher marks EXCUSED) */
  decide: async (ctx, requestId, { decision, note }) => {
    const leave = await loadVisible(ctx, requestId);
    if (!(await canDecide(ctx, leave))) {
      throw forbidden(
        "Only the class teacher or deputy of the student's section, the principal or an admin can decide this request"
      );
    }
    if (leave.status !== "PENDING") throw conflict(`This leave request was already ${word(leave.status)}`);

    const excused = await transaction(async tx => {
      const moved = await studentLeaveRepository.transition(
        ctx.tenantId,
        requestId,
        "PENDING",
        { status: decision, decidedBy: ctx.userId, decidedAt: new Date(), decisionNote: note || null },
        { dbc: tx }
      );
      if (!moved) throw conflict("This leave request was decided or cancelled a moment ago; refresh to see it");
      if (decision !== "APPROVED") return [];
      const year = await academicYearService.findById(ctx, leave.academicYearId);
      return attendanceService.excuseForLeave(
        ctx,
        { studentId: leave.studentId, dates: await schoolDays(ctx, year, leave), kinds: EXCUSED_KINDS[leave.session] },
        { dbc: tx }
      );
    });

    await publish(STUDENT_LEAVE_DECIDED, { tenantId: ctx.tenantId, requestId });
    return { leave: await staffView(ctx, await load(ctx, requestId)), excusedMarks: excused.length };
  },

  /* A parent applies for their child (the portal checks the child is theirs) */
  apply: async (ctx, studentId, { fromDate, toDate, session, reasonCategory, reason }) => {
    if (daysBetween(fromDate, toDate) + 1 > MAX_LEAVE_SPAN_DAYS) {
      throw unprocessable(`One request covers at most ${MAX_LEAVE_SPAN_DAYS} days; apply separately for longer leave`);
    }
    const year = await yearFor(ctx, { fromDate, toDate });
    await assertNotTooLate(ctx, fromDate);
    const enrollment = await enrollmentService.findForStudent(ctx, studentId, year.id);
    if (!enrollment) throw unprocessable(`The student is not enrolled in ${year.yearName}`);
    if (enrollment.status !== "ACTIVE") throw unprocessable("The student has left the school this year");

    const dates = await schoolDays(ctx, year, { fromDate, toDate });
    if (!dates.length) {
      throw unprocessable(
        `The school is closed on ${span({ fromDate, toDate })} (weekly offs and holidays), so no leave is needed`
      );
    }

    const requestId = await transaction(async tx => {
      /* One student's applications are serialized: the overlap check stays true until commit */
      await lockKey(tx, "student-leave", ctx.tenantId, studentId);
      const overlap = await studentLeaveRepository.findOverlap(
        ctx.tenantId,
        studentId,
        { fromDate, toDate, session },
        { dbc: tx }
      );
      if (overlap) {
        throw conflict(
          `There is already a ${word(overlap.status)} leave request for ${span(overlap)} that overlaps these dates`
        );
      }
      const created = await studentLeaveRepository.create(
        ctx.tenantId,
        {
          academicYearId: year.id,
          studentId,
          sectionId: enrollment.sectionId,
          fromDate,
          toDate,
          session,
          days: session === "FULL_DAY" ? dates.length : 0.5,
          reasonCategory,
          reason,
          requestedBy: ctx.userId
        },
        { dbc: tx }
      );
      return created.id;
    });

    await publish(STUDENT_LEAVE_REQUESTED, { tenantId: ctx.tenantId, requestId });
    return studentLeaveService.forStudentById(ctx, studentId, requestId);
  },

  /* For the portal: one student's requests in the year, with what the family may do */
  forStudent: async (ctx, studentId, query) => {
    const [result, today] = await Promise.all([
      studentLeaveRepository.list(ctx.tenantId, {
        page: query.page,
        limit: query.limit,
        with: WITH,
        orderBy: ORDER,
        conditions: [eq(leaves.academicYearId, ctx.academicYearId), eq(leaves.studentId, studentId), ...filters(query)]
      }),
      tenantToday(ctx.tenantId)
    ]);
    return { ...result, rows: result.rows.map(row => ({ ...row, canCancel: cancellable(row, today) })) };
  },

  forStudentById: async (ctx, studentId, requestId) => {
    const leave = await studentLeaveRepository.findOne(
      ctx.tenantId,
      [eq(leaves.id, requestId), eq(leaves.studentId, studentId)],
      { with: WITH }
    );
    if (!leave) throw notFound("Leave request");
    return { ...leave, canCancel: cancellable(leave, await tenantToday(ctx.tenantId)) };
  },

  /* The family withdraws it: pending, or approved before its first day */
  cancel: async (ctx, studentId, requestId, { reason }) => {
    const leave = await studentLeaveService.forStudentById(ctx, studentId, requestId);
    if (!leave.canCancel) {
      if (leave.status === "APPROVED") {
        throw unprocessable(
          "This leave has already started, so it can't be cancelled. Please tell the class teacher if your child came to school."
        );
      }
      throw conflict(`This leave request was already ${word(leave.status)}`);
    }
    const moved = await studentLeaveRepository.transition(ctx.tenantId, requestId, leave.status, {
      status: "CANCELLED",
      cancelledBy: ctx.userId,
      cancelledAt: new Date(),
      cancelReason: reason || null
    });
    if (!moved) throw conflict("This leave request changed a moment ago; refresh to see it");
    await publish(STUDENT_LEAVE_CANCELLED, {
      tenantId: ctx.tenantId,
      requestId,
      wasApproved: leave.status === "APPROVED"
    });
    return studentLeaveService.forStudentById(ctx, studentId, requestId);
  },

  /* For absence alerts: which of these students are on approved leave for a register of
     `kind` on `date` */
  excusedOn: async (ctx, studentIds, date, kind) => {
    if (!studentIds.length) return new Set();
    const rows = await studentLeaveRepository.covering(ctx.tenantId, { studentIds, date, statuses: ["APPROVED"] });
    return new Set(rows.filter(row => EXCUSED_KINDS[row.session].includes(kind)).map(row => row.studentId));
  },

  /* For the notification subscriber */
  findById: (ctx, requestId) => load(ctx, requestId)
};
