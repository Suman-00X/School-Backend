import { subscribe } from "../../../../common/events/events.js";
import { EXAM_SCHEDULE_CHANGED } from "../../exams/index.js";
import { admitCardService } from "../services/admitCard.service.js";

/* A paper of the exam was rescheduled, moved room, added or removed: issued admit cards
   show the papers as they are now */
subscribe(EXAM_SCHEDULE_CHANGED, "academics.admitCards.refreshPapers", async ({ tenantId, examId }) => {
  await admitCardService.refreshPapers({ tenantId, role: "SYSTEM" }, examId);
});
