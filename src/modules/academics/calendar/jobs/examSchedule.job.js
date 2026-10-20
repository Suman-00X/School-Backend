import { subscribe } from "../../../../common/events/events.js";
import { EXAM_SCHEDULE_CHANGED } from "../../exams/index.js";
import { calendarService } from "../services/calendar.service.js";

/* A paper of an exam on the calendar was rescheduled or removed, or the exam was removed:
   its calendar event spans the papers again, or goes with the exam */
subscribe(EXAM_SCHEDULE_CHANGED, "academics.calendar.syncExam", async ({ tenantId, examId }) => {
  await calendarService.syncExam({ tenantId, role: "SYSTEM" }, examId);
});
