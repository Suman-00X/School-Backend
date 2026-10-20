import { ok } from "../../../../common/http/responses.js";
import { nepPolicyService } from "../services/nepPolicy.service.js";

export const nepPolicyController = {
  get: async (req, res) => ok(res, await nepPolicyService.get(req.context), "NEP policy retrieved successfully"),

  update: async (req, res) =>
    ok(res, await nepPolicyService.update(req.context, req.body), "NEP policy updated successfully")
};
