import { sendFile } from "../../../../common/export/exporters.js";
import { created, ok, paginated } from "../../../../common/http/responses.js";
import { paymentService } from "../services/payment.service.js";
import { receiptService } from "../services/receipt.service.js";

export const paymentController = {
  recordOffline: async (req, res) => {
    const payment = await paymentService.recordOffline(req.context, req.params.invoiceId, req.body);
    return created(res, payment, `Payment received. Receipt ${payment.receiptNumber}`);
  },

  createOrder: async (req, res) =>
    created(res, await paymentService.createOnlineOrder(req.context, req.params.invoiceId), "Payment order created"),

  confirm: async (req, res) => {
    const payment = await paymentService.confirmOnline(req.context, req.body);
    return ok(res, payment, `Payment confirmed. Receipt ${payment.receiptNumber}`);
  },

  list: async (req, res) =>
    paginated(res, await paymentService.list(req.context, req.query), "Payments retrieved successfully"),

  getById: async (req, res) =>
    ok(res, await paymentService.getById(req.context, req.params.paymentId), "Payment retrieved successfully"),

  receipt: async (req, res) => {
    const { buffer, fileName } = await receiptService.pdf(req.context, req.params.paymentId);
    return sendFile(res, { buffer, fileName, format: "pdf" });
  },

  /* Gateway -> us. Always answer 200 once the signature is valid, so the gateway stops retrying. */
  webhook: async (req, res) => {
    const signature = req.get("x-razorpay-signature") ?? req.get("x-webhook-signature");
    const result = await paymentService.handleWebhook(req.rawBody, signature);
    return ok(res, result, result.handled ? "Webhook processed" : "Webhook ignored");
  }
};
