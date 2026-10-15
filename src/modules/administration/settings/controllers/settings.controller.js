import { ok } from "../../../../common/http/responses.js";
import { settingsService } from "../services/settings.service.js";

export const settingsController = {
  get: async (req, res) => ok(res, await settingsService.get(req.context), "School settings retrieved successfully"),
  update: async (req, res) =>
    ok(res, await settingsService.update(req.context, req.body), "School settings updated successfully")
};
