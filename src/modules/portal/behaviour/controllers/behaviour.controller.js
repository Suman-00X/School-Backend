import { ok, paginated } from "../../../../common/http/responses.js";
import { portalBehaviourService } from "../services/behaviour.service.js";

export const portalBehaviourController = {
  list: async (req, res) =>
    paginated(
      res,
      await portalBehaviourService.list(req.context, req.params.studentId, req.query),
      "Behaviour log retrieved successfully"
    ),

  summary: async (req, res) =>
    ok(
      res,
      await portalBehaviourService.summary(req.context, req.params.studentId),
      "Behaviour summary retrieved successfully"
    ),

  acknowledge: async (req, res) => {
    const { remark, already } = await portalBehaviourService.acknowledge(
      req.context,
      req.params.studentId,
      req.params.remarkId
    );
    return ok(res, remark, already ? "This remark was already acknowledged" : "Remark acknowledged; thank you");
  }
};
