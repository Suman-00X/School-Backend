import { subscribe } from "../../../common/events/events.js";
import { ADMIT_CARDS_ISSUED } from "../../academics/admit-cards/index.js";
import { examService } from "../../academics/exams/index.js";
import { studentService } from "../../users/students/index.js";
import { notificationService } from "../notifications/index.js";
import { recipients } from "../shared/services/recipients.service.js";
import { messages } from "../shared/templates/messages.js";

const nameOf = student => `${student?.user?.firstName ?? ""} ${student?.user?.lastName ?? ""}`.trim();

/* Newly issued admit cards -> each student and their parents. In-app only for now:
   email and WhatsApp join the channels once the school turns those on. */
subscribe(ADMIT_CARDS_ISSUED, "communication.admitCardsIssued", async ({ tenantId, examId, studentIds }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const exam = await examService.findById(ctx, examId);
  if (!exam) return;
  for (const student of await studentService.findManyByIds(ctx, studentIds)) {
    await notificationService.notify(ctx, {
      userIds: await recipients.forStudents(ctx, [student.id]),
      type: "ADMIT_CARD_ISSUED",
      ...messages.admitCardIssued({ studentName: nameOf(student), examName: exam.examName }),
      data: { examId, studentId: student.id },
      channels: ["IN_APP"]
    });
  }
});
