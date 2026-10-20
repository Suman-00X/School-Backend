import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { portalBehaviourController as controller } from "../controllers/behaviour.controller.js";
import { PORTAL_BEHAVIOUR_PERMISSIONS as can } from "../permissions/behaviour.permissions.js";
import { portalBehaviourValidators as rules } from "../validators/behaviour.validator.js";

/* /api/v1/me: the behaviour log book of the signed-in student or a parent's children */
const router = createRouter();

router.get("/students/:studentId/behaviour-remarks", authorize(can.read), validate(rules.list), inYear, controller.list);
router.get(
  "/students/:studentId/behaviour-remarks/summary",
  authorize(can.read),
  validate(rules.summary),
  inYear,
  controller.summary
);
router.post(
  "/students/:studentId/behaviour-remarks/:remarkId/acknowledgement",
  authorize(can.acknowledge),
  validate(rules.acknowledge),
  controller.acknowledge
);

export default router;
