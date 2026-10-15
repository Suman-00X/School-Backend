import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { rosterController as controller } from "../controllers/roster.controller.js";
import { ROSTER_PERMISSIONS as can } from "../permissions/roster.permissions.js";
import { rosterValidators as rules } from "../validators/roster.validator.js";

/* /api/v1/transport/routes/:routeId/roster · year: current, or X-Academic-Year-Id */
const router = createRouter();

router.get("/:routeId/roster", authorize(can.read), validate(rules.forRoute), inYear, controller.forRoute);

export default router;
