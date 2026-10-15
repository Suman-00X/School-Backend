import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { assignmentController as controller } from "../controllers/assignment.controller.js";
import { ASSIGNMENT_PERMISSIONS as can } from "../permissions/assignment.permissions.js";
import { assignmentValidators as rules } from "../validators/assignment.validator.js";

/* /api/v1/transport/assignments. `inYear`: current year, or X-Academic-Year-Id */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), inYear, controller.create);
router.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);
router.get("/:assignmentId", authorize(can.read), validate(rules.getById), controller.getById);
router.post("/:assignmentId/end", authorize(can.manage), validate(rules.end), controller.end);
/* Creates the replacing assignment (201) */
router.post("/:assignmentId/change", authorize(can.manage), validate(rules.change), controller.change);

export default router;
