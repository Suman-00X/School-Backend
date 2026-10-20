import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { portalLeaveController as controller } from "../controllers/leaveRequest.controller.js";
import { PORTAL_LEAVE_PERMISSIONS as can } from "../permissions/leaveRequest.permissions.js";
import { portalLeaveValidators as rules } from "../validators/leaveRequest.validator.js";

/* /api/v1/me: a parent's leave requests for their children. Applying picks the year the
   dates fall in; the list is the header's year. */
const router = createRouter();

router.get("/students/:studentId/leave-requests", authorize(can.read), validate(rules.list), inYear, controller.list);
router.post("/students/:studentId/leave-requests", authorize(can.apply), validate(rules.apply), controller.apply);
router.post(
  "/students/:studentId/leave-requests/:requestId/cancellation",
  authorize(can.cancel),
  validate(rules.cancel),
  controller.cancel
);

export default router;
