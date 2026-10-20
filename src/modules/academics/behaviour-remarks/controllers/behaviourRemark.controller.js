import { created, done, ok, paginated } from "../../../../common/http/responses.js";
import { behaviourRemarkService } from "../services/behaviourRemark.service.js";

export const behaviourRemarkController = {
  create: async (req, res) =>
    created(res, await behaviourRemarkService.create(req.context, req.body), "Behaviour remark recorded"),

  list: async (req, res) =>
    paginated(res, await behaviourRemarkService.list(req.context, req.query), "Behaviour remarks retrieved successfully"),

  summary: async (req, res) =>
    ok(
      res,
      await behaviourRemarkService.summary(req.context, req.params.studentId),
      "Behaviour summary retrieved successfully"
    ),

  getById: async (req, res) =>
    ok(res, await behaviourRemarkService.getById(req.context, req.params.remarkId), "Behaviour remark retrieved successfully"),

  update: async (req, res) =>
    ok(
      res,
      await behaviourRemarkService.update(req.context, req.params.remarkId, req.body),
      "Behaviour remark updated; parents will be asked to acknowledge it again"
    ),

  remove: async (req, res) => {
    await behaviourRemarkService.remove(req.context, req.params.remarkId);
    return done(res, "Behaviour remark removed");
  }
};
