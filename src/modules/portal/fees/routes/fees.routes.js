import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { feesController as controller } from "../controllers/fees.controller.js";
import { FEES_PERMISSIONS as can } from "../permissions/fees.permissions.js";
import { feesValidators as rules } from "../validators/fees.validator.js";

/* /api/v1/me: fees of the signed-in student or a parent's children */
const router = createRouter();

router.get("/students/:studentId/fees", authorize(can.read), validate(rules.statement), controller.statement);
router.get(
  "/students/:studentId/invoices/:invoiceId",
  authorize(can.read),
  validate(rules.invoice),
  controller.invoice
);
router.post(
  "/students/:studentId/invoices/:invoiceId/payment-orders",
  authorize(can.pay),
  validate(rules.startPayment),
  controller.startPayment
);
router.post("/payments/confirmations", authorize(can.pay), validate(rules.confirm), controller.confirmPayment);
router.get("/payments/:paymentId/receipt", authorize(can.read), validate(rules.receipt), controller.receipt);

export default router;
