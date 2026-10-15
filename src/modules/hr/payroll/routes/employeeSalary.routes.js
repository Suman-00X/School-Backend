import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { employeeSalaryController as controller } from "../controllers/payroll.controller.js";
import { EMPLOYEE_SALARY_PERMISSIONS as can } from "../permissions/payroll.permissions.js";
import { employeeSalaryValidators as rules } from "../validators/payroll.validator.js";

/* /api/v1/hr/employee-salaries. Revisions are never edited: post a new one. */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:salaryId", authorize(can.read), validate(rules.getById), controller.getById);

export default router;
