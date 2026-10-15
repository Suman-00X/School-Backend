import { subscribe } from "../../../common/events/events.js";
import { HOMEWORK_ASSIGNED, HOMEWORK_GRADED, homeworkService } from "../../academics/homework/index.js";
import { notificationService } from "../notifications/index.js";
import { recipients } from "../shared/services/recipients.service.js";
import { messages } from "../shared/templates/messages.js";

/* New homework -> students of the section and their parents (in-app) */
subscribe(HOMEWORK_ASSIGNED, "communication.homeworkAssigned", async ({ tenantId, homeworkId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const homework = await homeworkService.findById(ctx, homeworkId);
  if (!homework) return;
  const studentIds = await recipients.studentsInSections(ctx, { sectionIds: [homework.sectionId] });
  await notificationService.notify(ctx, {
    userIds: await recipients.forStudents(ctx, studentIds),
    type: "MESSAGE",
    ...messages.homeworkAssigned({
      subjectName: homework.subject?.subjectName ?? "",
      title: homework.title,
      dueDate: homework.dueDate
    }),
    data: { homeworkId }
  });
});

/* Graded or returned -> the student and their parents */
subscribe(
  HOMEWORK_GRADED,
  "communication.homeworkGraded",
  async ({ tenantId, homeworkId, submissionId, studentId, status }) => {
    const ctx = { tenantId, role: "SYSTEM" };
    const [homework, submission] = await Promise.all([
      homeworkService.findById(ctx, homeworkId),
      homeworkService.findSubmission(ctx, submissionId)
    ]);
    if (!homework || !submission) return;
    await notificationService.notify(ctx, {
      userIds: await recipients.forStudents(ctx, [studentId]),
      type: "MESSAGE",
      ...messages.homeworkGraded({
        title: homework.title,
        status,
        marksAwarded: submission.marksAwarded,
        maxMarks: homework.maxMarks
      }),
      data: { homeworkId, submissionId }
    });
  }
);
