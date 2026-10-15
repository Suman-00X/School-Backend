import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { routeController as controller } from "../controllers/route.controller.js";
import { ROUTE_PERMISSIONS as can } from "../permissions/route.permissions.js";
import { routeValidators as rules } from "../validators/route.validator.js";

/* /api/v1/transport/routes. Reads count occupancy in the current year (or X-Academic-Year-Id). */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);
router.get("/:routeId", authorize(can.read), validate(rules.getById), inYear, controller.getById);
router.patch("/:routeId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:routeId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
