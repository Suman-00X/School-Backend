import { createCrudController } from "../../../../common/crud/crudController.js";
import { ok } from "../../../../common/http/responses.js";
import { examService } from "../services/exam.service.js";

const crud = createCrudController(examService, {
  singular: "Exam",
  plural: "Exams",
  idParam: "examId",
  bulkKey: "exams"
});

export const examController = {
  ...crud,

  publishResults: async (req, res) =>
    ok(res, await examService.publishResults(req.context, req.params.examId), "Exam results published successfully"),

  unpublishResults: async (req, res) =>
    ok(res, await examService.unpublishResults(req.context, req.params.examId), "Exam results unpublished successfully")
};
