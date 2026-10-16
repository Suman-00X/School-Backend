import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resourceAssignmentController as controller } from "../controllers/resourceAssignment.controller.js";
import { RESOURCE_ASSIGNMENT_PERMISSIONS as can } from "../permissions/resourceAssignment.permissions.js";
import { resourceAssignmentValidators as rules } from "../validators/resourceAssignment.validator.js";

/* /api/v1/hostel/resource-assignments */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:assignmentId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:assignmentId", authorize(can.manage), validate(rules.update), controller.update);
router.post("/:assignmentId/release", authorize(can.manage), validate(rules.release), controller.release);
router.post("/:assignmentId/cancellation", authorize(can.manage), validate(rules.cancel), controller.cancel);

export default router;
