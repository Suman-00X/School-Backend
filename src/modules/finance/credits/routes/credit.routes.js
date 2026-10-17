import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { creditController as controller } from "../controllers/credit.controller.js";
import { CREDIT_PERMISSIONS as can } from "../permissions/credit.permissions.js";
import { creditValidators as rules } from "../validators/credit.validator.js";

/* /api/v1/finance/students/:studentId/credits (paying credit back is a refund: finance/payments) */
export const studentCreditRoutes = createRouter();
studentCreditRoutes.get("/:studentId/credits", authorize(can.read), validate(rules.forStudent), controller.forStudent);

/* /api/v1/finance/invoices/:invoiceId/credit-application */
export const invoiceCreditRoutes = createRouter();
invoiceCreditRoutes.post(
  "/:invoiceId/credit-application",
  authorize(can.apply),
  validate(rules.apply),
  controller.apply
);
