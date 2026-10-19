import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { enrollmentController as controller } from "../controllers/enrollment.controller.js";
import { ENROLLMENT_PERMISSIONS as can } from "../permissions/enrollment.permissions.js";
import { enrollmentValidators as rules } from "../validators/enrollment.validator.js";

/* /api/v1/academics/enrollments */
const router = createRouter();

router.post("/", authorize(can.create), validate(rules.create), inYear, controller.create);
router.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);

/* The school's roll-number rule (before /:enrollmentId) */
router.get("/policy", authorize(can.readPolicy), controller.getPolicy);
router.patch("/policy", authorize(can.managePolicy), validate(rules.updatePolicy), controller.updatePolicy);

/* Renumber sections of the selected year by the rule (action, 200; dryRun previews) */
router.post(
  "/roll-number-assignments",
  authorize(can.assignRollNumbers),
  validate(rules.assignRollNumbers),
  inYear,
  controller.assignRollNumbers
);

router.patch("/:enrollmentId", authorize(can.update), validate(rules.update), controller.update);

/* A promotion creates the next year's enrollment; both years are in the body */
router.post("/promotions", authorize(can.promote), validate(rules.promote), controller.promote);
router.post("/promotions/bulk", authorize(can.promote), validate(rules.promoteSection), controller.promoteSection);

export default router;
