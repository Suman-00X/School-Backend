import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { dashboardController as controller } from "../controllers/dashboard.controller.js";
import { DASHBOARD_PERMISSIONS as can } from "../permissions/dashboard.permissions.js";
import { dashboardValidators as rules } from "../validators/dashboard.validator.js";

/* /api/v1/reports/dashboards (current year, or X-Academic-Year-Id) */
const router = createRouter();

router.get("/overview", authorize(can.overview), inYear, controller.overview);
router.get("/attendance", authorize(can.attendance), validate(rules.attendance), inYear, controller.attendance);
router.get("/fees", authorize(can.fees), validate(rules.fees), inYear, controller.fees);
router.get("/academics", authorize(can.academics), validate(rules.academics), controller.academics);

export default router;
