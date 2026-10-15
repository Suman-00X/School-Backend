import { subscribe } from "../../../common/events/events.js";
import { claimOnce } from "../../../common/jobs/claims.js";
import { getTenant } from "../../../common/tenancy/tenant.service.js";
import { studentService } from "../../users/students/index.js";
import { ATTENDANCE_RECORDED } from "../../academics/attendance/index.js";
import { notificationService } from "../notifications/index.js";
import { recipients } from "../shared/services/recipients.service.js";
import { messages } from "../shared/templates/messages.js";

/* Parents hear once per student per day when their child is marked absent
   (retaking the register does not send the alert again) */
subscribe(
  ATTENDANCE_RECORDED,
  "communication.absenceAlerts",
  async ({ tenantId, date, periodNumber, absentStudentIds }) => {
    if (periodNumber !== 0 || !absentStudentIds?.length) return;
    const ctx = { tenantId, role: "SYSTEM" };
    const tenant = await getTenant(tenantId);

    for (const student of await studentService.findManyByIds(ctx, absentStudentIds)) {
      if (!(await claimOnce(`absence-alert:${tenantId}:${student.id}:${date}`))) continue;

      const studentName = `${student.user?.firstName ?? ""} ${student.user?.lastName ?? ""}`.trim();
      await notificationService.notify(ctx, {
        userIds: await recipients.forStudents(ctx, [student.id], { students: false, parents: true }),
        type: "ATTENDANCE_ABSENT",
        ...messages.attendanceAbsent({ studentName, date, schoolName: tenant?.name ?? "School" }),
        data: { studentId: student.id, date },
        channels: ["IN_APP", "SMS"]
      });
    }
  }
);
