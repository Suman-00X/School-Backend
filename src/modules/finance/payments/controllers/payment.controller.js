import { sendFile } from "../../../../common/export/exporters.js";
import { created, ok, paginated } from "../../../../common/http/responses.js";
import { paymentService } from "../services/payment.service.js";
import { receiptService } from "../services/receipt.service.js";
import { refundService } from "../services/refund.service.js";

const refundMessage = refund =>
  `Refund ${refund.refundNumber} of ${Number(refund.amount).toFixed(2)} ${
    refund.status === "PROCESSED" ? "processed" : "submitted to the payment gateway"
  } for receipt ${refund.payment.receiptNumber}`;

/* "Payment confirmed. Receipt RCPT26-000004. 200.00 more than the balance is kept as credit" */
const confirmedMessage = payment =>
  `Payment confirmed. Receipt ${payment.receiptNumber}` +
  (Number(payment.excessAmount) > 0
    ? `. ${Number(payment.excessAmount).toFixed(2)} more than the balance is kept as credit`
    : "");

export const paymentController = {
  recordOffline: async (req, res) => {
    const payment = await paymentService.recordOffline(req.context, req.params.invoiceId, req.body);
    return created(res, payment, `Payment received. Receipt ${payment.receiptNumber}`);
  },

  createOrder: async (req, res) => {
    const order = await paymentService.createOnlineOrder(req.context, req.params.invoiceId, req.body);
    return created(res, order, `Payment order created for ${order.amount.toFixed(2)} of ${order.invoiceNumber}`);
  },

  confirm: async (req, res) => {
    const payment = await paymentService.confirmOnline(req.context, req.body);
    return ok(res, payment, confirmedMessage(payment));
  },

  list: async (req, res) =>
    paginated(res, await paymentService.list(req.context, req.query), "Payments retrieved successfully"),

  getById: async (req, res) =>
    ok(res, await paymentService.getById(req.context, req.params.paymentId), "Payment retrieved successfully"),

  receipt: async (req, res) => {
    const { buffer, fileName } = await receiptService.pdf(req.context, req.params.paymentId);
    return sendFile(res, { buffer, fileName, format: "pdf" });
  },

  refund: async (req, res) => {
    const refund = await refundService.create(req.context, req.params.paymentId, req.body);
    return created(res, refund, refundMessage(refund));
  },

  listRefunds: async (req, res) =>
    paginated(res, await refundService.list(req.context, req.query), "Refunds retrieved successfully"),

  getRefund: async (req, res) =>
    ok(res, await refundService.getById(req.context, req.params.refundId), "Refund retrieved successfully"),

  /* Razorpay -> us, for one school. Always 200 once the signature is valid, so it stops retrying. */
  webhook: async (req, res) => {
    const result = await paymentService.handleWebhook(
      req.params.tenantId,
      req.rawBody,
      req.get("x-razorpay-signature")
    );
    return ok(res, result, result.handled ? "Webhook processed" : "Webhook ignored");
  }
};
