import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
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

/* /api/v1/public/payments/webhook (no token: the gateway signs the body) */
export const paymentWebhookRoutes = createRouter();
paymentWebhookRoutes.post("/webhook", controller.webhook);
