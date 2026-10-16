import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { assessmentSchemeController as controller } from "../controllers/assessmentScheme.controller.js";
import { ASSESSMENT_SCHEME_PERMISSIONS as can } from "../permissions/assessmentScheme.permissions.js";
import { assessmentSchemeValidators as rules } from "../validators/assessmentScheme.validator.js";

/* /api/v1/academics/assessment-schemes: term and annual results combining exams with weights */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), inYear, controller.create);
router.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);
router.get("/:schemeId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:schemeId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:schemeId", authorize(can.manage), validate(rules.remove), controller.remove);

/* Live weighted results */
router.get("/:schemeId/results", authorize(can.read), validate(rules.results), controller.results);
router.get("/:schemeId/students/:studentId", authorize(can.read), validate(rules.student), controller.student);
router.get("/:schemeId/students/:studentId/pdf", authorize(can.read), validate(rules.student), controller.pdf);
router.post("/:schemeId/previews", authorize(can.preview), validate(rules.preview), controller.preview);

/* Publication: create to publish, delete to withdraw; every publication is a version with report snapshots */
router.post("/:schemeId/result-publication", authorize(can.publish), validate(rules.publication), controller.publish);
router.delete(
  "/:schemeId/result-publication",
  authorize(can.publish),
  validate(rules.publication),
  controller.withdraw
);
router.get(
  "/:schemeId/result-publication/versions",
  authorize(can.read),
  validate(rules.versions),
  controller.versions
);
router.post(
  "/:schemeId/result-publication/versions",
  authorize(can.publish),
  validate(rules.publication),
  controller.revise
);
router.get(
  "/:schemeId/result-publication/comparison",
  authorize(can.read),
  validate(rules.comparison),
  controller.comparison
);

export default router;
