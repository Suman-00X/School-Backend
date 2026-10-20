import { subscribe } from "../../../common/events/events.js";
import {
  STUDENT_LEAVE_CANCELLED,
  STUDENT_LEAVE_DECIDED,
  STUDENT_LEAVE_REASONS,
  STUDENT_LEAVE_REQUESTED,
  STUDENT_LEAVE_SESSION_LABELS,
  studentLeaveService
} from "../../academics/student-leaves/index.js";
import { sectionService } from "../../academics/sections/index.js";
import { accountService } from "../../users/accounts/index.js";
import { teacherService } from "../../users/teachers/index.js";
import { notificationService } from "../notifications/index.js";
import { recipients } from "../shared/services/recipients.service.js";
import { messages } from "../shared/templates/messages.js";

const studentName = leave => {
  const user = leave.student?.user;
  return user ? `${user.firstName} ${user.lastName}`.trim() : "the student";
};
const sectionName = leave => `${leave.section?.class?.className}-${leave.section?.sectionName}`;
const datesOf = leave =>
  leave.fromDate === leave.toDate
    ? `${leave.fromDate}${leave.session === "FULL_DAY" ? "" : ` (${STUDENT_LEAVE_SESSION_LABELS[leave.session].toLowerCase()})`}`
    : `${leave.fromDate} to ${leave.toDate}`;

/* Who decides: the section's class teacher and deputy, else the principal and admins */
const decidersOf = async (ctx, leave) => {
  const section = await sectionService.findById(ctx, leave.sectionId);
  const teacherIds = [section?.classTeacherId, section?.deputyClassTeacherId].filter(Boolean);
  const teachers = await teacherService.findActiveByIds(ctx, teacherIds);
  if (teachers.length) return teachers.map(t => t.userId);
  return (await accountService.findByRoles(ctx, ["ADMIN", "PRINCIPAL"])).map(u => u.id);
};

const toDeciders = async (ctx, leave, message) =>
  notificationService.notify(ctx, {
    userIds: await decidersOf(ctx, leave),
    type: "MESSAGE",
    ...message,
    data: { leaveRequestId: leave.id, studentId: leave.studentId, sectionId: leave.sectionId }
  });

/* A parent applied -> the class teacher and deputy (in-app) */
subscribe(STUDENT_LEAVE_REQUESTED, "communication.studentLeaveRequested", async ({ tenantId, requestId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const leave = await studentLeaveService.findById(ctx, requestId);
  if (!leave || leave.status !== "PENDING") return;
  await toDeciders(
    ctx,
    leave,
    messages.studentLeaveRequested({
      studentName: studentName(leave),
      sectionName: sectionName(leave),
      dates: datesOf(leave),
      reasonLabel: STUDENT_LEAVE_REASONS.find(r => r.key === leave.reasonCategory)?.label ?? leave.reasonCategory
    })
  );
});

/* Approved or rejected -> the student and their parents (in-app) */
subscribe(STUDENT_LEAVE_DECIDED, "communication.studentLeaveDecided", async ({ tenantId, requestId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const leave = await studentLeaveService.findById(ctx, requestId);
  if (!leave || !["APPROVED", "REJECTED"].includes(leave.status)) return;
  await notificationService.notify(ctx, {
    userIds: await recipients.forStudents(ctx, [leave.studentId]),
    type: "MESSAGE",
    ...messages.studentLeaveDecided({
      studentName: studentName(leave),
      dates: datesOf(leave),
      approved: leave.status === "APPROVED",
      note: leave.decisionNote
    }),
    data: { leaveRequestId: leave.id, studentId: leave.studentId }
  });
});

/* An approved leave withdrawn -> the class teacher expects the student after all */
subscribe(
  STUDENT_LEAVE_CANCELLED,
  "communication.studentLeaveCancelled",
  async ({ tenantId, requestId, wasApproved }) => {
    if (!wasApproved) return;
    const ctx = { tenantId, role: "SYSTEM" };
    const leave = await studentLeaveService.findById(ctx, requestId);
    if (!leave) return;
    await toDeciders(
      ctx,
      leave,
      messages.studentLeaveCancelled({
        studentName: studentName(leave),
        sectionName: sectionName(leave),
        dates: datesOf(leave)
      })
    );
  }
);
