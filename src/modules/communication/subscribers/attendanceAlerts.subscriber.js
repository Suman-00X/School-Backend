import { subscribe } from "../../../common/events/events.js";
import { claimOnce } from "../../../common/jobs/claims.js";
import { getTenant } from "../../../common/tenancy/tenant.service.js";
import { studentService } from "../../users/students/index.js";
import { ATTENDANCE_RECORDED, attendanceService } from "../../academics/attendance/index.js";
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
