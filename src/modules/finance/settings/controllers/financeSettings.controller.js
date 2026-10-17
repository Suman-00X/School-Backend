import { ok } from "../../../../common/http/responses.js";
import { financeSettingsService } from "../services/financeSettings.service.js";

const limitNote = limit =>
  Number(limit) > 0
    ? `accountants refund up to ${Number(limit).toFixed(2)} per payment without approval`
    : "every refund needs an administrator's approval";

export const financeSettingsController = {
  get: async (req, res) =>
    ok(res, await financeSettingsService.get(req.context), "Finance settings retrieved successfully"),

  update: async (req, res) => {
    const settings = await financeSettingsService.update(req.context, req.body);
    return ok(res, settings, `Finance settings saved: ${limitNote(settings.refundApprovalLimit)}`);
  }
};
