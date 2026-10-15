import { between, eq } from "drizzle-orm";
import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { STAFF_ATTENDANCE_STATUSES } from "../../shared/constants/hr.constants.js";
import { employeeDirectory } from "../../shared/services/employeeDirectory.service.js";
import { payrollLock } from "../../shared/services/payrollLock.service.js";
import { CLOSURE_LABELS, workCalendar } from "../../shared/services/workCalendar.service.js";
import { monthBounds, monthOf } from "../../shared/utils/period.util.js";
import { staffAttendance } from "../models/staffAttendance.schema.js";
import { staffAttendanceRepository } from "../repositories/staffAttendance.repository.js";

const emptyCounts = () => Object.fromEntries(STAFF_ATTENDANCE_STATUSES.map(status => [status, 0]));

/* Days worked: PRESENT and ON_DUTY count fully, HALF_DAY as half */
const withTotals = counts => ({
  counts,
  marked: Object.values(counts).reduce((total, days) => total + days, 0),
  daysPresent: counts.PRESENT + counts.ON_DUTY + counts.HALF_DAY / 2
});

const markView = mark =>
  mark
    ? {
        status: mark.status,
        checkIn: mark.checkIn,
        checkOut: mark.checkOut,
        remarks: mark.remarks,
        leaveRequestId: mark.leaveRequestId
      }
    : { status: null, checkIn: null, checkOut: null, remarks: null, leaveRequestId: null };

/* Default window: the current month up to today */
const resolveRange = async (ctx, { from, to }) => {
  const today = await tenantToday(ctx.tenantId);
  return { from: from ?? monthBounds(monthOf(today)).start, to: to ?? today };
};

export const staffAttendanceService = {
  /* Record (or re-record) marks for one day; idempotent per employee and date */
  record: async (ctx, { date, records }) => {
    if (date > (await tenantToday(ctx.tenantId))) {
      throw unprocessable("Staff attendance cannot be recorded for a future date");
    }
    const closure = await workCalendar.closureOn(ctx, date);
    if (closure) {
      throw unprocessable(
        `Staff attendance cannot be recorded on ${date}: it is ${CLOSURE_LABELS[closure] ?? closure}`
      );
    }
    await employeeDirectory.assertEmployees(
      ctx,
      records.map(record => record.userId)
    );
    await payrollLock.assertOpen(ctx, [date]);

    const written = await staffAttendanceRepository.upsertMany(
      ctx.tenantId,
      records.map(record => ({
        userId: record.userId,
        date,
        status: record.status,
        checkIn: record.checkIn ?? null,
        checkOut: record.checkOut ?? null,
        remarks: record.remarks ?? null,
        recordedBy: ctx.userId
      }))
    );

    const counts = emptyCounts();
    for (const record of records) counts[record.status]++;
    const created = written.filter(row => row.created).length;
    return { date, created, updated: written.length - created, counts };
  },

  /* Every active employee with their mark for the day (or null) */
  register: async (ctx, { date }) => {
    const [employees, marks, closure] = await Promise.all([
      employeeDirectory.list(ctx),
      staffAttendanceRepository.findMany(ctx.tenantId, { conditions: [eq(staffAttendance.date, date)] }),
      workCalendar.closureOn(ctx, date)
    ]);
    const byUser = new Map(marks.map(mark => [mark.userId, mark]));
    const counts = emptyCounts();
    for (const employee of employees) {
      const status = byUser.get(employee.userId)?.status;
      if (status) counts[status]++;
    }
    const marked = Object.values(counts).reduce((total, days) => total + days, 0);
    return {
      date,
      closure,
      summary: { employees: employees.length, marked, unmarked: employees.length - marked, counts },
      employees: employees.map(employee => ({ ...employee, ...markView(byUser.get(employee.userId)) }))
    };
  },

  /* Per-employee totals over a date range (default: this month up to today) */
  summary: async (ctx, query) => {
    const { from, to } = await resolveRange(ctx, query);
    let employees = await employeeDirectory.list(ctx);
    if (query.userId) {
      employees = employees.filter(employee => employee.userId === query.userId);
      if (!employees.length) throw notFound("Employee");
    }
    const [rows, calendar] = await Promise.all([
      staffAttendanceRepository.countByUserAndStatus(ctx.tenantId, { userId: query.userId, from, to }),
      workCalendar.workingDays(ctx, from, to)
    ]);
    const countsByUser = new Map();
    for (const row of rows) {
      if (!countsByUser.has(row.userId)) countsByUser.set(row.userId, emptyCounts());
      countsByUser.get(row.userId)[row.status] = row.days;
    }
    return {
      from,
      to,
      workingDays: calendar.days.length,
      employees: employees.map(employee => ({
        ...employee,
        ...withTotals(countsByUser.get(employee.userId) ?? emptyCounts())
      }))
    };
  },

  /* The signed-in employee's own marks */
  mine: async (ctx, query) => {
    const { from, to } = await resolveRange(ctx, query);
    const marks = await staffAttendanceService.forUser(ctx, ctx.userId, from, to);
    const counts = emptyCounts();
    for (const mark of marks) counts[mark.status]++;
    return {
      userId: ctx.userId,
      from,
      to,
      ...withTotals(counts),
      days: marks.map(mark => ({ date: mark.date, ...markView(mark) }))
    };
  },

  /* For other submodules */
  forUser: (ctx, userId, from, to) =>
    staffAttendanceRepository.findMany(ctx.tenantId, {
      conditions: [eq(staffAttendance.userId, userId), between(staffAttendance.date, from, to)]
    }),

  /* Every employee's marks in [from, to] (payroll) */
  inRange: (ctx, from, to, { dbc } = {}) =>
    staffAttendanceRepository.findMany(ctx.tenantId, {
      conditions: [between(staffAttendance.date, from, to)],
      dbc
    }),

  /* An approved leave marks the days that have no mark yet -> dates marked */
  fillFromLeave: async (ctx, { userId, dates, status, remarks, leaveRequestId }, { dbc } = {}) => {
    const inserted = await staffAttendanceRepository.insertMissing(
      ctx.tenantId,
      dates.map(date => ({ userId, date, status, remarks, leaveRequestId, recordedBy: ctx.userId })),
      { dbc }
    );
    return inserted.map(row => row.date).sort();
  },

  /* A cancelled leave takes back the marks it wrote -> dates cleared */
  clearFromLeave: async (ctx, leaveRequestId, { dbc } = {}) =>
    (await staffAttendanceRepository.deleteForLeave(ctx.tenantId, leaveRequestId, { dbc })).map(row => row.date).sort()
};
