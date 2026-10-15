import { subscribe } from "../../../common/events/events.js";
import { claimOnce, releaseClaim } from "../../../common/jobs/claims.js";
import { EXAM_RESULTS_PUBLISHED, examPaperService, examService } from "../../academics/exams/index.js";
import { notificationService } from "../notifications/index.js";
import { recipients } from "../shared/services/recipients.service.js";
import { messages } from "../shared/templates/messages.js";

/* Students and parents of every section that sat the exam. Re-publishing after
   a withdrawal does not notify again. */
subscribe(EXAM_RESULTS_PUBLISHED, "communication.resultsPublished", async ({ tenantId, examId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const exam = await examService.findById(ctx, examId);
  if (!exam?.resultsPublishedAt) return;
  const claim = `results-published:${tenantId}:${examId}`;
  if (!(await claimOnce(claim))) return;

  try {
    const sectionIds = [...new Set((await examPaperService.findForExam(ctx, examId)).map(p => p.sectionId))];
    const studentIds = await recipients.studentsInSections(ctx, { sectionIds });
    await notificationService.notify(ctx, {
      userIds: await recipients.forStudents(ctx, studentIds),
      type: "RESULTS_PUBLISHED",
      ...messages.resultsPublished({ examName: exam.examName }),
      data: { examId },
      channels: ["IN_APP", "EMAIL"]
    });
  } catch (error) {
    await releaseClaim(claim);
    throw error;
  }
});
