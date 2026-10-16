import { createCrudController } from "../../../../common/crud/crudController.js";
import { examService } from "../services/exam.service.js";

/* Result publication lives in report-cards (it freezes report snapshots) */
export const examController = createCrudController(examService, {
  singular: "Exam",
  plural: "Exams",
  idParam: "examId",
  bulkKey: "exams"
});
