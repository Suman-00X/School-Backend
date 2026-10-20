import { defineJob, defineSchedule } from "../../../common/jobs/queue.js";
import { getTenant } from "../../../common/tenancy/tenant.service.js";
import { lowAttendanceService } from "../../academics/attendance/index.js";
import { teacherService } from "../../users/teachers/index.js";
import { notificationService } from "../notifications/index.js";
import { recipients } from "../shared/services/recipients.service.js";
import { messages } from "../shared/templates/messages.js";

const nameOf = student => `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim();

const recoverText = toRecover =>
  toRecover && `${toRecover.count} ${toRecover.unit === "PERIODS" ? "period" : "school day"}${toRecover.count === 1 ? "" : "s"}`;

/* Evening, every school (D-85): students whose attendance for the year fell under the
   threshold since the last run. Their parents hear once (in-app and SMS); each class teacher
   and deputy gets one in-app list of their own students. Nothing again while a student stays
   below; back above and down again alerts again. */
export const alertLowAttendance = async ({ tenantId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const { rule, academicYearId, fell } = await lowAttendanceService.crossings(ctx);
  if (!fell.length) return { sent: 0 };
  const schoolName = (await getTenant(tenantId))?.name ?? "School";

  const byTeacher = new Map();
  let sent = 0;
  let failure = null;
  for (const { student, section, classTeacherIds } of fell) {
    try {
      await notificationService.notify(ctx, {
        userIds: await recipients.forStudents(ctx, [student.studentId], { students: false, parents: true }),
        type: "ATTENDANCE_LOW",
        ...messages.attendanceLow({
          studentName: nameOf(student),
          percentage: student.percentage,
          threshold: rule.threshold,
          recover: recoverText(student.toRecover),
          schoolName
        }),
        data: { studentId: student.studentId, percentage: student.percentage, threshold: rule.threshold },
        channels: ["IN_APP", "SMS"]
      });
      sent++;
    } catch (error) {
      /* Flag off again: the retry (or tomorrow's run) alerts this student, teachers included */
      await lowAttendanceService.releaseFlag(ctx, academicYearId, student.studentId);
      failure ??= error;
      continue;
    }
    for (const teacherId of classTeacherIds) {
      if (!byTeacher.has(teacherId)) byTeacher.set(teacherId, []);
      byTeacher.get(teacherId).push({ student, section });
    }
  }

  const teachers = await teacherService.findActiveByIds(ctx, [...byTeacher.keys()]);
  for (const teacher of teachers) {
    const fallen = byTeacher.get(teacher.id);
    await notificationService.notify(ctx, {
      userIds: [teacher.userId],
      type: "ATTENDANCE_LOW",
      ...messages.attendanceLowDigest({
        threshold: rule.threshold,
        students: fallen.map(({ student, section }) => `${nameOf(student)} (${section.name}, ${student.percentage}%)`)
      }),
      data: {
        threshold: rule.threshold,
        students: fallen.map(({ student, section }) => ({
          studentId: student.studentId,
          sectionId: section.id,
          percentage: student.percentage
        }))
      }
    });
  }
  if (failure) throw failure;
  return { sent, teachers: teachers.length };
};

export const lowAttendanceJob = defineJob("communication.lowAttendance", alertLowAttendance, { attempts: 2 });

/* 14:30 UTC is 20:00 in India, after the day's registers */
defineSchedule("communication.lowAttendance.evening", {
  job: lowAttendanceJob,
  cron: "30 14 * * *",
  everyMs: 24 * 60 * 60 * 1000
});
