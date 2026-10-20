import { created, done, ok, paginated } from "../../../../common/http/responses.js";
import { assessmentService } from "../services/assessment.service.js";

export const assessmentController = {
  buckets: async (req, res) => ok(res, await assessmentService.buckets(req.context), "Buckets retrieved successfully"),

  list: async (req, res) =>
    paginated(res, await assessmentService.list(req.context, req.query), "Assessments retrieved successfully"),

  getById: async (req, res) =>
    ok(res, await assessmentService.getById(req.context, req.params.assessmentId), "Assessment retrieved successfully"),

  create: async (req, res) => {
    const item = await assessmentService.create(req.context, req.body);
    return created(res, item, `${item.title} added to ${item.bucket.name}`);
  },

  update: async (req, res) => {
    const item = await assessmentService.update(req.context, req.params.assessmentId, req.body);
    return ok(res, item, `${item.title} updated`);
  },

  remove: async (req, res) => {
    const item = await assessmentService.remove(req.context, req.params.assessmentId);
    return done(res, `${item.title} removed`);
  },

  marks: async (req, res) =>
    ok(res, await assessmentService.marks(req.context, req.params.assessmentId), "Marks retrieved successfully"),

  recordMarks: async (req, res) => {
    const summary = await assessmentService.recordMarks(req.context, req.params.assessmentId, req.body.marks);
    return ok(
      res,
      summary,
      `Marks saved: ${summary.created} recorded, ${summary.updated} updated${summary.cleared ? `, ${summary.cleared} cleared` : ""}`
    );
  }
};
