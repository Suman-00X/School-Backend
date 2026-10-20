import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { assessmentController as controller } from "../controllers/assessment.controller.js";
import { ASSESSMENT_PERMISSIONS as can } from "../permissions/assessment.permissions.js";
import { assessmentValidators as rules } from "../validators/assessment.validator.js";

/* /api/v1/academics/assessments */
const router = createRouter();

/* The year's scheme buckets teachers can fill (first: no other path may capture it) */
router.get("/buckets", authorize(can.read), inYear, controller.buckets);

router.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);
router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/:assessmentId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:assessmentId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:assessmentId", authorize(can.manage), validate(rules.remove), controller.remove);
router.get("/:assessmentId/marks", authorize(can.read), validate(rules.marks), controller.marks);
router.post("/:assessmentId/marks", authorize(can.manage), validate(rules.recordMarks), controller.recordMarks);

export default router;
