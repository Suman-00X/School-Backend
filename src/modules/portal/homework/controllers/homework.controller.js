import { created, ok, paginated } from "../../../../common/http/responses.js";
import { portalHomeworkService } from "../services/homework.service.js";

export const portalHomeworkController = {
  list: async (req, res) =>
    paginated(
      res,
      await portalHomeworkService.list(req.context, req.params.studentId, req.query),
      "Homework retrieved successfully"
    ),

  detail: async (req, res) =>
    ok(
      res,
      await portalHomeworkService.detail(req.context, req.params.studentId, req.params.homeworkId),
      "Homework retrieved successfully"
    ),

  attachmentUrl: async (req, res) =>
    ok(
      res,
      await portalHomeworkService.attachmentUrl(
        req.context,
        req.params.studentId,
        req.params.homeworkId,
        req.params.fileId
      ),
      "Download link created"
    ),

  submit: async (req, res) => {
    const { submission, created: isNew } = await portalHomeworkService.submit(
      req.context,
      req.params.homeworkId,
      req.body,
      req.file
    );
    const message = submission.isLate ? "Homework submitted (late)" : "Homework submitted";
    return isNew ? created(res, submission, message) : ok(res, submission, `${message} again`);
  }
};
