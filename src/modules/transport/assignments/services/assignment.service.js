import { asc, eq, inArray } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { addDays, maxDate, minDate } from "../../../../common/utils/date.util.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { enrollmentService } from "../../../academics/enrollments/index.js";
import { studentService } from "../../../users/students/index.js";
import { routeService } from "../../routes/index.js";
import { fullName, routeLabel } from "../../shared/utils/format.util.js";
import { vehicleService } from "../../vehicles/index.js";
import { transportAssignments as assignments } from "../models/assignment.schema.js";
import { assignmentRepository } from "../repositories/assignment.repository.js";

const STOP_COLUMNS = {
  id: true,
  name: true,
  sequence: true,
  pickupTime: true,
  dropTime: true,
  landmark: true,
  monthlyFee: true
};

const withDetails = {
  student: {
    columns: { id: true, studentCode: true, admissionNumber: true },
    with: { user: { columns: { firstName: true, lastName: true } } }
  },
  route: { columns: { id: true, name: true, code: true } },
  stop: { columns: STOP_COLUMNS }
};

const active = () => eq(assignments.status, "ACTIVE");

/* Today in the school's time zone, moved inside the academic year */
const defaultDate = async (ctx, year) =>
  minDate(maxDate(await tenantToday(ctx.tenantId), year.startDate), year.endDate);

const assertInYear = (field, value, year) => {
  if (value < year.startDate || value > year.endDate) {
    throw unprocessable(`${field} must fall within ${year.yearName} (${year.startDate} to ${year.endDate})`);
  }
};

/* The student behind an assignment request, actively enrolled in the year */
const enrolledStudent = async (ctx, studentId, year) => {
  const [student] = await studentService.findManyByIds(ctx, [studentId]);
  if (!student) throw unprocessable("studentId does not refer to an existing student");
  const enrollment = await enrollmentService.findForStudent(ctx, studentId, year.id);
  if (enrollment?.status !== "ACTIVE") {
    throw unprocessable(`${fullName(student.user)} is not enrolled in ${year.yearName}`);
  }
  return student;
};

const assertNoActive = async (ctx, student, year, dbc) => {
  const current = await assignmentRepository.findOne(
    ctx.tenantId,
    [eq(assignments.academicYearId, year.id), eq(assignments.studentId, student.id), active()],
    { dbc, with: { route: { columns: { name: true, code: true } } } }
  );
  if (current) {
    throw conflict(
      `${fullName(student.user)} already uses ${routeLabel(current.route)} in ${year.yearName}; change or end that assignment instead`
    );
  }
};

/* Lock the route and claim a seat on it: the stop must be on the route and the
   route's vehicle must have a free seat in the year. Concurrent requests for the
   last seat queue on the route lock, so exactly one of them gets it. */
const takeSeat = async (ctx, { routeId, stopId, academicYearId }, dbc) => {
  const route = await routeService.lockForUpdate(ctx, routeId, { dbc });
  if (!route) throw unprocessable("routeId does not refer to an existing route");
  const stop = await routeService.findStop(ctx, routeId, stopId, { dbc });
  if (!stop) throw unprocessable(`The selected stop is not on ${routeLabel(route)}`);
  if (!route.vehicleId) {
    throw unprocessable(`${routeLabel(route)} has no vehicle yet; assign one before adding students`);
  }
  const vehicle = await vehicleService.findById(ctx, route.vehicleId, { dbc });
  const assigned = await assignmentRepository.count(
    ctx.tenantId,
    [eq(assignments.routeId, routeId), eq(assignments.academicYearId, academicYearId), active()],
    { dbc }
  );
  if (assigned >= vehicle.capacity) {
    throw unprocessable(`${routeLabel(route)} is full (${assigned} of ${vehicle.capacity} seats)`);
  }
  return { route, stop };
};

export const assignmentService = {
  /* Year-scoped */
  list: (ctx, { page, limit, routeId, stopId, studentId, status }) =>
    assignmentRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withDetails,
      conditions: [
        eq(assignments.academicYearId, ctx.academicYearId),
        routeId && eq(assignments.routeId, routeId),
        stopId && eq(assignments.stopId, stopId),
        studentId && eq(assignments.studentId, studentId),
        status && eq(assignments.status, status)
      ].filter(Boolean)
    }),

  getById: async (ctx, assignmentId) => {
    const assignment = await assignmentRepository.findById(ctx.tenantId, assignmentId, { with: withDetails });
    if (!assignment) throw notFound("Transport assignment");
    return assignment;
  },

  /* A student starts using a route in the request's academic year */
  create: async (ctx, { studentId, routeId, stopId, direction, startDate, notes }) => {
    const year = ctx.academicYear;
    const student = await enrolledStudent(ctx, studentId, year);
    const start = startDate ?? (await defaultDate(ctx, year));
    assertInYear("startDate", start, year);

    const id = await transaction(async tx => {
      await assertNoActive(ctx, student, year, tx);
      await takeSeat(ctx, { routeId, stopId, academicYearId: year.id }, tx);
      const created = await assignmentRepository.create(
        ctx.tenantId,
        { academicYearId: year.id, studentId, routeId, stopId, direction, startDate: start, notes },
        { dbc: tx }
      );
      return created.id;
    });
    return assignmentService.getById(ctx, id);
  },

  /* Stop using transport. endDate (default today) is the last day of use. */
  end: async (ctx, assignmentId, { endDate }) => {
    await transaction(async tx => {
      const assignment = await assignmentRepository.lockForUpdate(ctx.tenantId, assignmentId, { dbc: tx });
      if (!assignment) throw notFound("Transport assignment");
      if (assignment.status === "ENDED") throw conflict(`This assignment already ended on ${assignment.endDate}`);
      const year = await academicYearService.findById(ctx, assignment.academicYearId);
      const last = endDate ?? maxDate(await defaultDate(ctx, year), assignment.startDate);
      if (last < assignment.startDate) {
        throw unprocessable(`endDate must be on or after the start date (${assignment.startDate})`);
      }
      assertInYear("endDate", last, year);
      await assignmentRepository.update(
        ctx.tenantId,
        assignmentId,
        { status: "ENDED", endDate: last, endedAt: new Date() },
        { dbc: tx }
      );
    });
    return assignmentService.getById(ctx, assignmentId);
  },

  /* Move a student to another route/stop in one transaction: the current assignment
     ends the day before effectiveDate and a new one starts on it */
  change: async (ctx, assignmentId, { routeId, stopId, direction, effectiveDate }) => {
    const id = await transaction(async tx => {
      const current = await assignmentRepository.lockForUpdate(ctx.tenantId, assignmentId, { dbc: tx });
      if (!current) throw notFound("Transport assignment");
      if (current.status === "ENDED") throw conflict("This assignment has ended; create a new assignment instead");
      const nextDirection = direction ?? current.direction;
      if (current.routeId === routeId && current.stopId === stopId && current.direction === nextDirection) {
        throw unprocessable("The student already uses this route and stop");
      }

      const year = await academicYearService.findById(ctx, current.academicYearId);
      const start = effectiveDate ?? maxDate(await defaultDate(ctx, year), current.startDate);
      if (start < current.startDate) {
        throw unprocessable(`effectiveDate must be on or after the current assignment's start (${current.startDate})`);
      }
      assertInYear("effectiveDate", start, year);

      await assignmentRepository.update(
        ctx.tenantId,
        assignmentId,
        { status: "ENDED", endDate: maxDate(addDays(start, -1), current.startDate), endedAt: new Date() },
        { dbc: tx }
      );
      await takeSeat(ctx, { routeId, stopId, academicYearId: year.id }, tx);
      const created = await assignmentRepository.create(
        ctx.tenantId,
        {
          academicYearId: year.id,
          studentId: current.studentId,
          routeId,
          stopId,
          direction: nextDirection,
          startDate: start,
          previousAssignmentId: current.id,
          notes: current.notes
        },
        { dbc: tx }
      );
      return created.id;
    });
    return assignmentService.getById(ctx, id);
  },

  /* For other submodules */

  /* Highest number of active assignments the route has in any one year */
  peakActiveCount: async (ctx, routeId, { dbc } = {}) => {
    const perYear = await assignmentRepository.countActiveBy(
      ctx.tenantId,
      assignments.academicYearId,
      [eq(assignments.routeId, routeId)],
      { dbc }
    );
    return Math.max(0, ...perYear.values());
  },

  /* Map(routeId -> active assignments in the year) */
  activeCountsByRoute: (ctx, routeIds, academicYearId) =>
    routeIds.length
      ? assignmentRepository.countActiveBy(ctx.tenantId, assignments.routeId, [
          inArray(assignments.routeId, routeIds),
          eq(assignments.academicYearId, academicYearId)
        ])
      : new Map(),

  /* Map(stopId -> active assignments), in one year or across years */
  activeCountsByStop: (ctx, routeId, { academicYearId, dbc } = {}) =>
    assignmentRepository.countActiveBy(
      ctx.tenantId,
      assignments.stopId,
      [eq(assignments.routeId, routeId), academicYearId && eq(assignments.academicYearId, academicYearId)].filter(
        Boolean
      ),
      { dbc }
    ),

  /* Active assignments of a route in a year (roster) */
  activeForRoute: (ctx, routeId, academicYearId) =>
    assignmentRepository.findMany(ctx.tenantId, {
      conditions: [eq(assignments.routeId, routeId), eq(assignments.academicYearId, academicYearId), active()],
      orderBy: asc(assignments.createdAt)
    }),

  /* Active assignments of these students in a year, with route, vehicle and stop */
  activeForStudents: (ctx, studentIds, academicYearId) =>
    studentIds.length
      ? assignmentRepository.findMany(ctx.tenantId, {
          conditions: [
            inArray(assignments.studentId, studentIds),
            eq(assignments.academicYearId, academicYearId),
            active()
          ],
          with: {
            route: { columns: { id: true, name: true, code: true }, with: { vehicle: true } },
            stop: { columns: STOP_COLUMNS }
          }
        })
      : []
};
