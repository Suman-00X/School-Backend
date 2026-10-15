import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { salaryComponentController as controller } from "../controllers/payroll.controller.js";
import { SALARY_COMPONENT_PERMISSIONS as can } from "../permissions/payroll.permissions.js";
import { salaryComponentValidators as rules } from "../validators/payroll.validator.js";

/* /api/v1/hr/salary-components */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:componentId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:componentId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:componentId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
