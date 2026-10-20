import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { studentLeaveController as controller } from "../controllers/studentLeave.controller.js";
import { STUDENT_LEAVE_PERMISSIONS as can } from "../permissions/studentLeave.permissions.js";
import { studentLeaveValidators as rules } from "../validators/studentLeave.validator.js";

/* /api/v1/academics/student-leaves: leave parents asked for their children, in the header's year */
const router = createRouter();

router.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);
/* For the register: who in the section has a pending or approved leave on the date */
router.get("/on-leave", authorize(can.read), validate(rules.onLeave), controller.onLeave);
router.get("/:requestId", authorize(can.read), validate(rules.getById), controller.getById);
router.post("/:requestId/decision", authorize(can.decide), validate(rules.decide), controller.decide);

export default router;
