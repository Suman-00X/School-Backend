import { ok } from "../../../../common/http/responses.js";
import { paymentSettingsService } from "../services/paymentSettings.service.js";

export const paymentSettingsController = {
  get: async (req, res) =>
    ok(res, await paymentSettingsService.get(req.context), "Online payment settings retrieved successfully"),

  replace: async (req, res) => {
    const settings = await paymentSettingsService.replace(req.context, req.body);
    return ok(res, settings, `Razorpay keys saved (${settings.mode} mode). Online payments are on`);
  },

  remove: async (req, res) =>
    ok(res, await paymentSettingsService.remove(req.context), "Razorpay keys removed. Online payments are off"),

  testConnection: async (req, res) => {
    const settings = await paymentSettingsService.testConnection(req.context);
    return ok(res, settings, `Connected to Razorpay (${settings.mode} mode)`);
  }
};
