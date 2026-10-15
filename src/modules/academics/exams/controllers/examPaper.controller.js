import { created, done, ok, paginated } from "../../../../common/http/responses.js";
import { examPaperService } from "../services/examPaper.service.js";

export const examPaperController = {
  list: async (req, res) =>
    paginated(
      res,
      await examPaperService.list(req.context, req.params.examId, req.query),
      "Exam papers retrieved successfully"
    ),

  create: async (req, res) =>
    created(
      res,
      await examPaperService.create(req.context, req.params.examId, req.body),
      "Exam paper created successfully"
    ),

  update: async (req, res) =>
    ok(
      res,
      await examPaperService.update(req.context, req.params.examId, req.params.paperId, req.body),
      "Exam paper updated successfully"
    ),

  remove: async (req, res) => {
    await examPaperService.remove(req.context, req.params.examId, req.params.paperId);
    return done(res, "Exam paper removed successfully");
  }
};
