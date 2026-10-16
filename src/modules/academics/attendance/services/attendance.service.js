import { asc, between, eq } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { publish } from "../../../../common/events/events.js";
import { forbidden, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { addDays, minDate } from "../../../../common/utils/date.util.js";
import { academicYearService } from "../../academic-years/index.js";
import { calendarService } from "../../calendar/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { sectionService } from "../../sections/index.js";
import { ATTENDANCE_STATUSES, ATTENDANCE_WEIGHT } from "../../shared/constants/academic.constants.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { attendanceRecords, attendanceSessions } from "../models/attendance.schema.js";
import {
  attendancePolicyRepository,
  attendanceRecordRepository,
  attendanceSessionRepository
} from "../repositories/attendance.repository.js";

export const ATTENDANCE_RECORDED = "academics.attendance.recorded";

const CLOSURE_LABELS = {
  WEEKLY_OFF: "a weekly off day",
  HOLIDAY: "a holiday",
  VACATION: "a vacation day",
  OUTSIDE_ACADEMIC_YEAR: "outside the academic year"
};

const loadSection = async (ctx, sectionId) => {
  const section = await sectionService.findById(ctx, sectionId);
  if (!section) throw notFound("Section");
  const academicYear = await academicYearService.findById(ctx, section.academicYearId);
  return { section, academicYear };
};

/* Locked once the edit window after the date has passed */
const lockState = (policy, date, today) => {
  const lastEditable = addDays(date, policy.editWindowDays);
  return { locked: lastEditable < today, editableUntil: lastEditable };
};

/* A locked register: override roles only, with a reason -> the override to record (or null) */
const checkLock = (ctx, policy, date, today, overrideReason) => {
  const { locked, editableUntil } = lockState(policy, date, today);
  if (!locked) return null;
  if (!policy.overrideRoles.includes(ctx.role)) {
    throw forbidden(
      `The register for ${date} was locked after ${editableUntil}. Only ${policy.overrideRoles.join(" or ")} can change it now.`
    );
  }
  if (!overrideReason) throw unprocessable(`The register for ${date} is locked: give an overrideReason to change it`);
  return { lockOverrideReason: overrideReason, lockOverriddenBy: ctx.userId, lockOverriddenAt: new Date() };
};

const emptyCounts = () => Object.fromEntries(ATTENDANCE_STATUSES.map(status => [status, 0]));

/* Attendance % over working days: LATE counts as present, HALF_DAY as half,
   EXCUSED days are left out of the denominator */
const summarise = (counts, workingDays) => {
  const marked = Object.values(counts).reduce((total, days) => total + days, 0);
  const attended = Object.entries(counts).reduce(
    (total, [status, days]) => total + ATTENDANCE_WEIGHT[status] * days,
    0
  );
  const countable = workingDays - counts.EXCUSED;
  return {
    workingDays,
    marked,
    unmarked: Math.max(workingDays - marked, 0),
    counts,
    percentage: countable > 0 ? Math.round((attended / countable) * 1000) / 10 : null
  };
};

export const attendancePolicyService = {
  get: ctx => attendancePolicyRepository.ensure(ctx.tenantId),
  update: async (ctx, changes) => {
    const policy = await attendancePolicyRepository.ensure(ctx.tenantId);
    return attendancePolicyRepository.update(ctx.tenantId, policy.id, changes);
  }
};

export const attendanceService = {
  /* Take (or retake) a register. -> { session, summary, created } */
  record: async (ctx, { sectionId, date, periodNumber, subjectId, remarks, records, overrideReason }) => {
    const { section, academicYear } = await loadSection(ctx, sectionId);

    await teachingScope.assertSection(ctx, sectionId, periodNumber ? { subjectId } : {});

    const today = await tenantToday(ctx.tenantId);
    if (date > today) throw unprocessable("Attendance cannot be recorded for a future date");
    const closure = await calendarService.closureOn(ctx, academicYear, date);
    if (closure)
      throw unprocessable(`Attendance cannot be recorded on ${date}: it is ${CLOSURE_LABELS[closure] ?? closure}`);
    const override = checkLock(ctx, await attendancePolicyRepository.ensure(ctx.tenantId), date, today, overrideReason);

    const roster = await enrollmentService.findRoster(ctx, sectionId);
    const enrolled = new Set(roster.map(enrollment => enrollment.studentId));
    const strangers = records.filter(record => !enrolled.has(record.studentId)).map(record => record.studentId);
    if (strangers.length) {
      throw unprocessable(`${strangers.length} student(s) are not enrolled in this section: ${strangers.join(", ")}`);
    }

    const result = await transaction(async tx => {
      const session = await attendanceSessionRepository.upsert(
        ctx.tenantId,
        {
          academicYearId: academicYear.id,
          sectionId,
          date,
          periodNumber,
          subjectId: subjectId ?? null,
          takenBy: ctx.userId,
          remarks: remarks ?? null,
          lockOverrideReason: override?.lockOverrideReason ?? null,
          lockOverriddenBy: override?.lockOverriddenBy ?? null,
          lockOverriddenAt: override?.lockOverriddenAt ?? null
        },
        { dbc: tx }
      );
      await attendanceRecordRepository.upsertMany(
        ctx.tenantId,
        records.map(record => ({
          sessionId: session.id,
          academicYearId: academicYear.id,
          sectionId,
          studentId: record.studentId,
          date,
          periodNumber,
          status: record.status,
          remarks: record.remarks ?? null
        })),
        { dbc: tx }
      );
      return session;
    });

    const counts = emptyCounts();
    for (const record of records) counts[record.status]++;

    await publish(ATTENDANCE_RECORDED, {
      tenantId: ctx.tenantId,
      sessionId: result.id,
      sectionId,
      date,
      periodNumber,
      absentStudentIds: records.filter(r => r.status === "ABSENT").map(r => r.studentId)
    });

    return {
      created: result.created,
      overridden: Boolean(override),
      session: { id: result.id, sectionId, sectionName: section.sectionName, date, periodNumber },
      summary: { rosterSize: roster.length, marked: records.length, unmarked: roster.length - records.length, counts }
    };
  },

  /* The register for a section/date: every enrolled student with their mark (or null) */
  register: async (ctx, { sectionId, date, periodNumber }) => {
    const { section } = await loadSection(ctx, sectionId);
    await teachingScope.assertSection(ctx, sectionId);

    const session = await attendanceSessionRepository.findOne(ctx.tenantId, [
      eq(attendanceSessions.sectionId, sectionId),
      eq(attendanceSessions.date, date),
      eq(attendanceSessions.periodNumber, periodNumber)
    ]);
    const marks = session
      ? await attendanceRecordRepository.findMany(ctx.tenantId, {
          conditions: [eq(attendanceRecords.sessionId, session.id)]
        })
      : [];
    const byStudent = new Map(marks.map(mark => [mark.studentId, mark]));
    const roster = await enrollmentService.findRoster(ctx, sectionId);
    const policy = await attendancePolicyRepository.ensure(ctx.tenantId);

    return {
      section: { id: section.id, sectionName: section.sectionName, className: section.class?.className },
      date,
      periodNumber,
      taken: Boolean(session),
      takenAt: session?.takenAt ?? null,
      takenBy: session?.takenBy ?? null,
      ...lockState(policy, date, await tenantToday(ctx.tenantId)),
      lockOverride: session?.lockOverriddenAt
        ? { reason: session.lockOverrideReason, by: session.lockOverriddenBy, at: session.lockOverriddenAt }
        : null,
      students: roster.map(enrollment => ({
        studentId: enrollment.studentId,
        rollNumber: enrollment.rollNumber,
        firstName: enrollment.student?.user?.firstName,
        lastName: enrollment.student?.user?.lastName,
        status: byStudent.get(enrollment.studentId)?.status ?? null,
        remarks: byStudent.get(enrollment.studentId)?.remarks ?? null
      }))
    };
  },

  /* Per-student totals for a section over a date range (defaults: year start..today) */
  sectionSummary: async (ctx, { sectionId, from, to }) => {
    const { section, academicYear } = await loadSection(ctx, sectionId);
    await teachingScope.assertSection(ctx, sectionId);

    const today = await tenantToday(ctx.tenantId);
    const start = from ?? academicYear.startDate;
    const end = minDate(to ?? today, today);
    const {
      workingDays,
      from: rangeFrom,
      to: rangeTo
    } = await calendarService.workingDays(ctx, academicYear, start, end);

    const [roster, rows] = await Promise.all([
      enrollmentService.findRoster(ctx, sectionId),
      attendanceRecordRepository.countByStudentAndStatus(ctx.tenantId, { sectionId, from: rangeFrom, to: rangeTo })
    ]);

    const countsByStudent = new Map();
    for (const row of rows) {
      if (!countsByStudent.has(row.studentId)) countsByStudent.set(row.studentId, emptyCounts());
      countsByStudent.get(row.studentId)[row.status] = row.days;
    }

    const students = roster.map(enrollment => ({
      studentId: enrollment.studentId,
      rollNumber: enrollment.rollNumber,
      firstName: enrollment.student?.user?.firstName,
      lastName: enrollment.student?.user?.lastName,
      ...summarise(countsByStudent.get(enrollment.studentId) ?? emptyCounts(), workingDays.length)
    }));
    const percentages = students.map(s => s.percentage).filter(p => p !== null);

    return {
      section: { id: section.id, sectionName: section.sectionName, className: section.class?.className },
      from: rangeFrom,
      to: rangeTo,
      workingDays: workingDays.length,
      averagePercentage: percentages.length
        ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10) / 10
        : null,
      students
    };
  },

  /* One student's daily marks and totals in an academic year (for staff and the portal) */
  studentAttendance: async (ctx, studentId, { from, to, academicYearId }) => {
    const academicYear = academicYearId
      ? await academicYearService.findById(ctx, academicYearId)
      : await academicYearService.findCurrent(ctx);
    if (!academicYear) throw unprocessable("No academic year found for this request");

    const enrollment = await enrollmentService.findForStudent(ctx, studentId, academicYear.id);
    if (!enrollment) throw notFound("Enrollment for this student in the academic year");
    await teachingScope.assertSection(ctx, enrollment.sectionId);

    const today = await tenantToday(ctx.tenantId);
    const {
      workingDays,
      from: rangeFrom,
      to: rangeTo
    } = await calendarService.workingDays(
      ctx,
      academicYear,
      from ?? academicYear.startDate,
      minDate(to ?? today, today)
    );

    const inRange = await attendanceRecordRepository.findMany(ctx.tenantId, {
      conditions: [
        eq(attendanceRecords.studentId, studentId),
        eq(attendanceRecords.academicYearId, academicYear.id),
        eq(attendanceRecords.periodNumber, 0),
        between(attendanceRecords.date, rangeFrom, rangeTo)
      ],
      orderBy: asc(attendanceRecords.date)
    });

    const counts = emptyCounts();
    for (const day of inRange) counts[day.status]++;

    return {
      studentId,
      academicYearId: academicYear.id,
      from: rangeFrom,
      to: rangeTo,
      ...summarise(counts, workingDays.length),
      days: inRange.map(day => ({ date: day.date, status: day.status, remarks: day.remarks }))
    };
  }
};
