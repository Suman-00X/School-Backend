import { ok } from "../../../../common/http/responses.js";
import { libraryPolicyService } from "../services/libraryPolicy.service.js";

export const libraryPolicyController = {
  get: async (req, res) =>
    ok(res, await libraryPolicyService.get(req.context), "Library policy retrieved successfully"),

  update: async (req, res) =>
    ok(res, await libraryPolicyService.update(req.context, req.body), "Library policy updated successfully")
};
