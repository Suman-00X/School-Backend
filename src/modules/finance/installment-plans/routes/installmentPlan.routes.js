import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { installmentPlanController as controller } from "../controllers/installmentPlan.controller.js";
import { INSTALLMENT_PLAN_PERMISSIONS as can } from "../permissions/installmentPlan.permissions.js";
import { installmentPlanValidators as rules } from "../validators/installmentPlan.validator.js";

/* /api/v1/finance/installment-plans */
export const installmentPlanRoutes = createRouter();
installmentPlanRoutes.post("/", authorize(can.manage), validate(rules.create), inYear, controller.create);
installmentPlanRoutes.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);
installmentPlanRoutes.get("/:installmentPlanId", authorize(can.read), validate(rules.getById), controller.getById);
installmentPlanRoutes.patch("/:installmentPlanId", authorize(can.manage), validate(rules.update), controller.update);
installmentPlanRoutes.delete("/:installmentPlanId", authorize(can.manage), validate(rules.remove), controller.remove);

/* /api/v1/finance/plan-assignments: which plan each student pays by this year */
export const planAssignmentRoutes = createRouter();
planAssignmentRoutes.get("/", authorize(can.read), validate(rules.listAssignments), inYear, controller.listAssignments);
planAssignmentRoutes.post("/", authorize(can.assign), validate(rules.assign), inYear, controller.assign);
planAssignmentRoutes.post("/bulk", authorize(can.assign), validate(rules.assignMany), inYear, controller.assignMany);
