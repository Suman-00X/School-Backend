import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { payrollRunController as controller } from "../controllers/payroll.controller.js";
import { PAYROLL_RUN_PERMISSIONS as can } from "../permissions/payroll.permissions.js";
import { payrollRunValidators as rules } from "../validators/payroll.validator.js";

/* /api/v1/hr/payroll-runs */
const router = createRouter();

/* One run per month; created as a DRAFT with every payslip computed */
router.post("/", authorize(can.run), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:runId", authorize(can.read), validate(rules.getById), controller.getById);
router.get("/:runId/payslips", authorize(can.read), validate(rules.payslips), controller.payslips);
router.post("/:runId/recalculation", authorize(can.run), validate(rules.getById), controller.recalculate);
router.post("/:runId/finalization", authorize(can.finalize), validate(rules.getById), controller.finalize);

export default router;
