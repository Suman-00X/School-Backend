import { createCrudController } from "../../../../common/crud/crudController.js";
import { examService } from "../services/exam.service.js";

export const examController = createCrudController(examService, {
  singular: "Exam",
  plural: "Exams",
  idParam: "examId",
  bulkKey: "exams"
});
