import { unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { academicYearService } from "../../academic-years/index.js";
import { sectionService } from "../../sections/index.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { LowAttendanceFlag } from "../models/lowAttendanceFlag.model.js";
import { attendancePolicyRepository } from "../repositories/attendance.repository.js";
import { attendanceService, sectionLabel } from "./attendance.service.js";

/* Low attendance (D-85): a student whose attendance for the year so far is under the school's
   threshold (default 75%) once they have at least `lowAttendanceMinDays` countable days, so
   one absence in the first week does not count. The percentage is the one the attendance
   pages show (days, or periods in a period-wise year). Teachers see it for their sections,
   families for their children, and both are alerted once when a student falls below. */

const ruleOf = policy => ({ threshold: policy.lowAttendanceThreshold, minDays: policy.lowAttendanceMinDays });

const isLow = (rule, totals) =>
  totals.percentage !== null && totals.countableDays >= rule.minDays && totals.percentage < rule.threshold;

/* Fully attended days (or periods) in a row that bring the student back to the threshold:
   (attended + n) / (countable + n) >= threshold */
const toRecover = (rule, totals) => {
  const [unit, attended, countable] =
    totals.basis === "PERIODS"
      ? ["PERIODS", totals.periods.attended, totals.periods.held - totals.periods.excused]
      : ["DAYS", totals.attendedDays, totals.countableDays];
  if (rule.threshold >= 100) return null;
  const share = rule.threshold / 100;
  return { unit, count: Math.max(1, Math.ceil((share * countable - attended) / (1 - share) - 1e-9)) };
};

const studentView = (rule, totals) => ({
  percentage: totals.percentage,
  basis: totals.basis,
  attendedDays: totals.attendedDays,
  countableDays: totals.countableDays,
  toRecover: toRecover(rule, totals)
});

const currentYear = async ctx => {
  const year = await academicYearService.findCurrent(ctx);
  if (!year) throw unprocessable("The school has not set a current academic year yet");
  return year;
};

/* The section's students under the threshold, lowest first */
const lowInSection = async (ctx, rule, section) => {
  const summary = await attendanceService.sectionSummary(ctx, { sectionId: section.id });
  return summary.students
    .filter(student => isLow(rule, student))
    .map(student => ({
      studentId: student.studentId,
      rollNumber: student.rollNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      ...studentView(rule, student)
    }))
    .sort((a, b) => a.percentage - b.percentage);
};

const byClassOrder = (a, b) =>
  (a.class?.classOrder ?? 0) - (b.class?.classOrder ?? 0) || a.sectionName.localeCompare(b.sectionName);

/* The teacher's part in a section: CLASS_TEACHER, DEPUTY or SUBJECT (null for school-wide roles) */
const roleIn = (scope, sectionId) => {
  if (!scope) return null;
  if (scope.classTeacherOf.has(sectionId)) return "CLASS_TEACHER";
  return scope.deputyOf.has(sectionId) ? "DEPUTY" : "SUBJECT";
};
const ROLE_ORDER = { CLASS_TEACHER: 0, DEPUTY: 1, SUBJECT: 2 };

export const lowAttendanceService = {
  rule: async ctx => ruleOf(await attendancePolicyRepository.ensure(ctx.tenantId)),

  /* This year's sections the caller sees (a teacher: the ones they teach or lead; ADMIN and
     PRINCIPAL: all, or `sectionId`) with their students under the threshold. Sections with
     none are left out; the class teacher's own sections come first. */
  list: async (ctx, { sectionId } = {}) => {
    const [year, rule, today] = await Promise.all([
      currentYear(ctx),
      lowAttendanceService.rule(ctx),
      tenantToday(ctx.tenantId)
    ]);
    const [scope, visible] = await Promise.all([teachingScope.of(ctx), teachingScope.sectionIds(ctx)]);
    const allowed = visible && new Set(visible);
    const sections = (await sectionService.findAllInYear(ctx, year.id))
      .filter(section => (!allowed || allowed.has(section.id)) && (!sectionId || section.id === sectionId))
      .sort(byClassOrder);

    const flagged = (
      await Promise.all(
        sections.map(async section => ({
          section: { id: section.id, name: sectionLabel(section) },
          role: roleIn(scope, section.id),
          students: await lowInSection(ctx, rule, section)
        }))
      )
    )
      .filter(entry => entry.students.length)
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 0) - (ROLE_ORDER[b.role] ?? 0));

    return {
      academicYearId: year.id,
      asOf: today,
      ...rule,
      total: flagged.reduce((sum, entry) => sum + entry.students.length, 0),
      sections: flagged
    };
  },

  /* For the portal: these students (the caller's children, or themselves) under the threshold.
     A student not enrolled this year is skipped. */
  forStudents: async (ctx, students) => {
    const [rule, today] = await Promise.all([lowAttendanceService.rule(ctx), tenantToday(ctx.tenantId)]);
    const flagged = await Promise.all(
      students.map(async student => {
        if (!student.current) return null;
        const totals = await attendanceService.studentAttendance(ctx, student.id, {});
        return isLow(rule, totals)
          ? {
              studentId: student.id,
              firstName: student.firstName,
              lastName: student.lastName,
              section: student.current.section,
              ...studentView(rule, totals)
            }
          : null;
      })
    );
    return { asOf: today, ...rule, students: flagged.filter(Boolean) };
  },

  /* Daily, for the alerts: every section of the year checked against the threshold; the
     flags of students who fell below are turned on, those back above turned off.
     -> { rule, fell: [{ student, section, classTeacherIds }] } (only the newly fallen) */
  crossings: async ctx => {
    const year = await academicYearService.findCurrent(ctx);
    if (!year) return { rule: null, fell: [] };
    const rule = await lowAttendanceService.rule(ctx);
    const sections = (await sectionService.findAllInYear(ctx, year.id)).sort(byClassOrder);
    const flagsOn = new Set(
      (
        await LowAttendanceFlag.find(
          { tenantId: ctx.tenantId, academicYearId: year.id, below: true },
          { studentId: 1 }
        ).lean()
      ).map(flag => flag.studentId)
    );

    const fell = [];
    const stillLow = new Set();
    for (const section of sections) {
      for (const student of await lowInSection(ctx, rule, section)) {
        stillLow.add(student.studentId);
        if (flagsOn.has(student.studentId)) continue;
        /* Off (or never seen) -> on; a concurrent run that got there first matches nothing */
        const result = await LowAttendanceFlag.updateOne(
          { tenantId: ctx.tenantId, academicYearId: year.id, studentId: student.studentId, below: { $ne: true } },
          { $set: { below: true, percentage: student.percentage, threshold: rule.threshold, flaggedAt: new Date() } },
          { upsert: true }
        ).catch(error => (error?.code === 11000 ? { modifiedCount: 0, upsertedCount: 0 } : Promise.reject(error)));
        if (!result.modifiedCount && !result.upsertedCount) continue;
        fell.push({
          student,
          section: { id: section.id, name: sectionLabel(section) },
          classTeacherIds: [section.classTeacherId, section.deputyClassTeacherId].filter(Boolean)
        });
      }
    }

    const recovered = [...flagsOn].filter(studentId => !stillLow.has(studentId));
    if (recovered.length) {
      await LowAttendanceFlag.updateMany(
        { tenantId: ctx.tenantId, academicYearId: year.id, studentId: { $in: recovered } },
        { $set: { below: false, clearedAt: new Date() } }
      );
    }
    return { rule, academicYearId: year.id, fell, recovered: recovered.length };
  },

  /* The alert for a fallen student could not be sent: turn the flag off so the next run retries */
  releaseFlag: (ctx, academicYearId, studentId) =>
    LowAttendanceFlag.updateOne(
      { tenantId: ctx.tenantId, academicYearId, studentId },
      { $set: { below: false, flaggedAt: null } }
    )
};
