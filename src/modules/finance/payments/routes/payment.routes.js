import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { tenantFromParam } from "../../../../common/tenancy/tenantContext.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { paymentController as controller } from "../controllers/payment.controller.js";
import { PAYMENT_PERMISSIONS as can } from "../permissions/payment.permissions.js";
import { paymentValidators as rules } from "../validators/payment.validator.js";

/* /api/v1/finance/invoices/:invoiceId/payments (collect against an invoice) */
export const invoicePaymentRoutes = createRouter();
invoicePaymentRoutes.post(
  "/:invoiceId/payments",
  authorize(can.collect),
  validate(rules.recordOffline),
  controller.recordOffline
);
invoicePaymentRoutes.post(
  "/:invoiceId/payment-orders",
  authorize(can.collect),
  validate(rules.createOrder),
  controller.createOrder
);

/* /api/v1/finance/payments */
export const paymentRoutes = createRouter();
paymentRoutes.post("/confirmations", authorize(can.collect), validate(rules.confirm), controller.confirm);
paymentRoutes.get("/", authorize(can.read), validate(rules.list), controller.list);
paymentRoutes.get("/:paymentId", authorize(can.read), validate(rules.getById), controller.getById);
paymentRoutes.get("/:paymentId/receipt", authorize(can.read), validate(rules.getById), controller.receipt);
paymentRoutes.post("/:paymentId/refunds", authorize(can.refund), validate(rules.refund), controller.refund);

/* /api/v1/finance/students/:studentId/credit-refunds: pay a student's credit back (a refund like any other) */
export const studentRefundRoutes = createRouter();
studentRefundRoutes.post(
  "/:studentId/credit-refunds",
  authorize(can.refund),
  validate(rules.creditRefund),
  controller.creditRefund
);

/* /api/v1/finance/refunds */
export const refundRoutes = createRouter();
refundRoutes.get("/", authorize(can.read), validate(rules.listRefunds), controller.listRefunds);
refundRoutes.get("/:refundId", authorize(can.read), validate(rules.getRefund), controller.getRefund);
refundRoutes.get("/:refundId/receipt", authorize(can.read), validate(rules.getRefund), controller.refundReceipt);
/* Maker-checker: an administrator approves (which pays it out) or rejects a request */
refundRoutes.post(
  "/:refundId/approval",
  authorize(can.approveRefund),
  validate(rules.approveRefund),
  controller.approveRefund
);
refundRoutes.post(
  "/:refundId/rejection",
  authorize(can.approveRefund),
  validate(rules.rejectRefund),
  controller.rejectRefund
);

/* /api/v1/public/payments/razorpay/:tenantId/webhook (no token: signed with the school's webhook secret) */
export const paymentWebhookRoutes = createRouter();
paymentWebhookRoutes.post(
  "/razorpay/:tenantId/webhook",
  validate(rules.webhook),
  tenantFromParam("tenantId"),
  controller.webhook
);
