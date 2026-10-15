import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { payslipController as controller } from "../controllers/payroll.controller.js";
import { PAYSLIP_PERMISSIONS as can } from "../permissions/payroll.permissions.js";
import { payslipValidators as rules } from "../validators/payroll.validator.js";

/* /api/v1/hr/payslips */
export const payslipRoutes = createRouter();
payslipRoutes.get("/:payslipId", authorize(can.read), validate(rules.getById), controller.getById);
payslipRoutes.get("/:payslipId/pdf", authorize(can.read), validate(rules.getById), controller.pdf);

/* /api/v1/hr/me/payslips: the signed-in employee's payslips of finalized runs */
export const myPayslipRoutes = createRouter();
myPayslipRoutes.get("/payslips", authorize(can.readOwn), validate(rules.mine), controller.mine);
myPayslipRoutes.get("/payslips/:payslipId", authorize(can.readOwn), validate(rules.getById), controller.getMine);
myPayslipRoutes.get("/payslips/:payslipId/pdf", authorize(can.readOwn), validate(rules.getById), controller.myPdf);
