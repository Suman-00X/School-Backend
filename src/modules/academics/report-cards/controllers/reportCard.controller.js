import { ok } from "../../../../common/http/responses.js";
import { reportCardService } from "../services/reportCard.service.js";

export const reportCardController = {
  section: async (req, res) =>
    ok(
      res,
      await reportCardService.forSection(req.context, { sectionId: req.params.sectionId, examId: req.query.examId }),
      "Result sheet retrieved successfully"
    ),

  student: async (req, res) =>
    ok(
      res,
      await reportCardService.forStudent(req.context, req.params.studentId, req.query),
      "Report card retrieved successfully"
    )
};
