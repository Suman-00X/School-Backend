import { sendFile } from "../../../../common/export/exporters.js";
import { created, ok, paginated } from "../../../../common/http/responses.js";
import { paymentService } from "../services/payment.service.js";
import { receiptService } from "../services/receipt.service.js";
import { refundReceiptService } from "../services/refundReceipt.service.js";
import { refundService } from "../services/refund.service.js";

const outcome = refund =>
  ({
    REQUESTED: "requested",
    PROCESSED: "processed",
    PENDING: "submitted to the payment gateway"
  })[refund.status] ?? refund.status.toLowerCase();

/* "Refund RFND26-000003 of 400.00 (approved and) processed for receipt RCPT26-000007" */
const refundMessage = (refund, { approved = false } = {}) =>
  `Refund ${refund.refundNumber} of ${Number(refund.amount).toFixed(2)} ${approved ? "approved and " : ""}${outcome(refund)} for receipt ${refund.payment.receiptNumber}` +
  (refund.status === "REQUESTED" ? ". An administrator must approve it before any money is paid back" : "");

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

  approveRefund: async (req, res) => {
    const refund = await refundService.approve(req.context, req.params.refundId);
    return ok(res, refund, refundMessage(refund, { approved: true }));
  },

  rejectRefund: async (req, res) => {
    const refund = await refundService.reject(req.context, req.params.refundId, req.body);
    return ok(res, refund, `Refund ${refund.refundNumber} rejected: ${refund.rejectionReason}. No money was paid back`);
  },

  refundReceipt: async (req, res) => {
    const { buffer, fileName } = await refundReceiptService.pdf(req.context, req.params.refundId);
    return sendFile(res, { buffer, fileName, format: "pdf" });
  },

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
