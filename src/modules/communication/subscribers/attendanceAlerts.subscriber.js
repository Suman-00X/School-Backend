import { subscribe } from "../../../common/events/events.js";
import { claimOnce, releaseClaim } from "../../../common/jobs/claims.js";
import { defineJob, defineSchedule } from "../../../common/jobs/queue.js";
import { getTenant } from "../../../common/tenancy/tenant.service.js";
import { addDays, hourIn, todayIn } from "../../../common/utils/date.util.js";
import { studentService } from "../../users/students/index.js";
import { ATTENDANCE_RECORDED, attendanceService, missingRegisterService } from "../../academics/attendance/index.js";
import { notificationService } from "../notifications/index.js";
import { recipients } from "../shared/services/recipients.service.js";
import { messages } from "../shared/templates/messages.js";

const SESSION_NAMES = { FORENOON: "forenoon", AFTERNOON: "afternoon" };

/* What the parents hear, and its once-only key (retaking a register never sends it again):
   - DAY: once per student per day;
   - FORENOON / AFTERNOON: once per session missed;
   - PERIOD: once per day, on the first absence, listing the periods missed so far. */
const alertFor = async (ctx, { kind = "DAY", date }, student, studentName, schoolName) => {
  const day = `absence-alert:${ctx.tenantId}:${student.id}:${date}`;
  if (SESSION_NAMES[kind]) {
    return {
      key: `${day}:${kind}`,
      data: { studentId: student.id, date, session: kind },
      ...messages.attendanceAbsentSession({ studentName, date, session: SESSION_NAMES[kind], schoolName })
    };
  }
  if (kind === "PERIOD") {
    const missed = await attendanceService.absentPeriods(ctx, student.id, date);
    if (!missed.length) return null;
    return {
      key: day,
      data: { studentId: student.id, date, periods: missed.map(p => p.periodNumber) },
      ...messages.attendanceAbsentPeriods({
        studentName,
        date,
        periods: missed.map(p => `Period ${p.periodNumber}${p.subjectName ? ` (${p.subjectName})` : ""}`),
        schoolName
      })
    };
  }
  return {
    key: day,
    data: { studentId: student.id, date },
    ...messages.attendanceAbsent({ studentName, date, schoolName })
  };
};

subscribe(ATTENDANCE_RECORDED, "communication.absenceAlerts", async payload => {
  if (!payload.absentStudentIds?.length) return;
  const ctx = { tenantId: payload.tenantId, role: "SYSTEM" };
  const tenant = await getTenant(payload.tenantId);

  for (const student of await studentService.findManyByIds(ctx, payload.absentStudentIds)) {
    const studentName = `${student.user?.firstName ?? ""} ${student.user?.lastName ?? ""}`.trim();
    const alert = await alertFor(ctx, payload, student, studentName, tenant?.name ?? "School");
    if (!alert || !(await claimOnce(alert.key))) continue;

    const { key: _key, data, ...message } = alert;
    await notificationService.notify(ctx, {
      userIds: await recipients.forStudents(ctx, [student.id], { students: false, parents: true }),
      type: "ATTENDANCE_ABSENT",
      ...message,
      data,
      channels: ["IN_APP", "SMS"]
    });
  }
});

/* Before this hour (school time) the day is not over: a run then covers the day before */
const EVENING_HOUR = 17;

const registerText = register =>
  `${register.section.name}: ${register.kind === "DAY" ? "daily register" : register.label}`;

/* Evening, every school: each teacher hears once (in-app) about the registers of the day
   they answer for that nobody took. Closed days send nothing. `date` picks the day. */
export const remindMissedRegisters = async ({ tenantId, date }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const timeZone = (await getTenant(tenantId))?.timezone ?? "UTC";
  const today = todayIn(timeZone);
  const day = date ?? (hourIn(timeZone) >= EVENING_HOUR ? today : addDays(today, -1));
  const missed = await missingRegisterService.missedByTeacher(ctx, day);
  if (!missed) return { date: day, closed: true, sent: 0 };

  let sent = 0;
  for (const { teacher, registers } of missed) {
    const key = `missed-registers:${tenantId}:${day}:${teacher.teacherId}`;
    if (!(await claimOnce(key))) continue;
    try {
      await notificationService.notify(ctx, {
        userIds: [teacher.userId],
        type: "ATTENDANCE_MISSED",
        ...messages.registersMissed({ date: day, registers: registers.map(registerText) }),
        data: {
          date: day,
          registers: registers.map(r => ({ sectionId: r.section.id, kind: r.kind, periodNumber: r.periodNumber }))
        }
      });
      sent++;
    } catch (error) {
      await releaseClaim(key);
      throw error;
    }
  }
  return { date: day, sent };
};

export const missedRegistersJob = defineJob("communication.missedRegisters", remindMissedRegisters, { attempts: 2 });

/* 14:00 UTC is 19:30 in India */
defineSchedule("communication.missedRegisters.evening", {
  job: missedRegistersJob,
  cron: "0 14 * * *",
  everyMs: 24 * 60 * 60 * 1000
});
