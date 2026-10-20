import { subscribe } from "../../../common/events/events.js";
import {
  SUBSTITUTION_ASSIGNED,
  SUBSTITUTION_CANCELLED,
  substitutionService
} from "../../academics/substitutions/index.js";
import { teacherService } from "../../users/teachers/index.js";
import { notificationService } from "../notifications/index.js";
import { messages } from "../shared/templates/messages.js";

const nameOf = teacher => `${teacher?.user?.firstName ?? ""} ${teacher?.user?.lastName ?? ""}`.trim();
const sectionName = section => `${section.class?.className}-${section.sectionName}`;

/* What the substitute does in the period: the subject they teach, or the activity */
const whatOf = plan =>
  plan.kind === "ACTIVITY"
    ? `${plan.activity} (in charge)`
    : `teach ${(plan.subject ?? plan.slot?.subject)?.subjectName ?? "the class"}`;

/* A lesson to cover -> the substitute (in-app). Cancelled before the job ran: nothing to say. */
subscribe(SUBSTITUTION_ASSIGNED, "communication.substitutionAssigned", async ({ tenantId, substitutionId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const plan = await substitutionService.findById(ctx, substitutionId);
  if (!plan?.substituteTeacherId) return;
  const [substitute] = await teacherService.findActiveByIds(ctx, [plan.substituteTeacherId]);
  if (!substitute) return;
  await notificationService.notify(ctx, {
    userIds: [substitute.userId],
    type: "SUBSTITUTION",
    ...messages.substitutionAssigned({
      date: plan.date,
      periodName: plan.period.name,
      startTime: plan.period.startTime,
      sectionName: sectionName(plan.section),
      absentTeacher: nameOf(plan.absentTeacher),
      what: whatOf(plan)
    }),
    data: { substitutionId, date: plan.date, sectionId: plan.sectionId }
  });
});

/* Taken off a lesson (cancelled, or given to someone else) -> that teacher. The event
   names the lesson: a cancelled plan can no longer be read. */
subscribe(
  SUBSTITUTION_CANCELLED,
  "communication.substitutionCancelled",
  async ({ tenantId, substitutionId, teacherId, date, sectionId, sectionName: section, periodName }) => {
    const ctx = { tenantId, role: "SYSTEM" };
    const [teacher] = await teacherService.findActiveByIds(ctx, [teacherId]);
    if (!teacher) return;
    await notificationService.notify(ctx, {
      userIds: [teacher.userId],
      type: "SUBSTITUTION",
      ...messages.substitutionCancelled({ date, periodName, sectionName: section }),
      data: { substitutionId, date, sectionId }
    });
  }
);
