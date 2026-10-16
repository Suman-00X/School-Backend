import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { invoiceController as controller } from "../controllers/invoice.controller.js";
import { INVOICE_PERMISSIONS as can } from "../permissions/invoice.permissions.js";
import { invoiceValidators as rules } from "../validators/invoice.validator.js";

/* /api/v1/finance/invoices */
export const invoiceRoutes = createRouter();

/* Issuing creates invoices in bulk, scheduled by each student's installment plan */
invoiceRoutes.post("/generation", authorize(can.issue), validate(rules.generate), controller.generate);
invoiceRoutes.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);
invoiceRoutes.get("/:invoiceId", authorize(can.read), validate(rules.getById), controller.getById);
invoiceRoutes.post("/:invoiceId/cancellation", authorize(can.cancel), validate(rules.cancel), controller.cancel);
invoiceRoutes.post(
  "/:invoiceId/late-fee-waiver",
  authorize(can.waiveLateFee),
  validate(rules.waiveLateFee),
  controller.waiveLateFee
);
invoiceRoutes.delete(
  "/:invoiceId/late-fee-waiver",
  authorize(can.waiveLateFee),
  validate(rules.reinstateLateFee),
  controller.reinstateLateFee
);

/* /api/v1/finance/students/:studentId/statement */
export const statementRoutes = createRouter();
statementRoutes.get("/:studentId/statement", authorize(can.read), validate(rules.statement), controller.statement);
