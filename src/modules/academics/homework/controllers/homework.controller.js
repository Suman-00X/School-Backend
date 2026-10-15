import { created, done, ok, paginated } from "../../../../common/http/responses.js";
import { homeworkService } from "../services/homework.service.js";

export const homeworkController = {
  create: async (req, res) =>
    created(res, await homeworkService.create(req.context, req.body), "Homework set successfully"),
  list: async (req, res) =>
    paginated(res, await homeworkService.list(req.context, req.query), "Homework retrieved successfully"),
  getById: async (req, res) =>
    ok(res, await homeworkService.getById(req.context, req.params.homeworkId), "Homework retrieved successfully"),
  update: async (req, res) =>
    ok(
      res,
      await homeworkService.update(req.context, req.params.homeworkId, req.body),
      "Homework updated successfully"
    ),
  remove: async (req, res) => {
    await homeworkService.remove(req.context, req.params.homeworkId);
    return done(res, "Homework deleted successfully");
  },

  addAttachment: async (req, res) => {
    const file = await homeworkService.addAttachment(req.context, req.params.homeworkId, req.file);
    return created(res, file, `${file.fileName} attached`);
  },
  removeAttachment: async (req, res) => {
    await homeworkService.removeAttachment(req.context, req.params.homeworkId, req.params.fileId);
    return done(res, "Attachment removed");
  },
  attachmentUrl: async (req, res) =>
    ok(
      res,
      await homeworkService.attachmentUrl(req.context, req.params.homeworkId, req.params.fileId),
      "Download link created"
    ),

  submissions: async (req, res) =>
    ok(
      res,
      await homeworkService.submissions(req.context, req.params.homeworkId),
      "Submissions retrieved successfully"
    ),
  grade: async (req, res) => {
    const submission = await homeworkService.grade(
      req.context,
      req.params.homeworkId,
      req.params.submissionId,
      req.body
    );
    return ok(
      res,
      submission,
      submission.status === "RETURNED" ? "Submission returned for rework" : "Submission graded"
    );
  },
  submissionAttachmentUrl: async (req, res) =>
    ok(
      res,
      await homeworkService.submissionAttachmentUrl(
        req.context,
        req.params.homeworkId,
        req.params.submissionId,
        req.params.fileId
      ),
      "Download link created"
    )
};
