import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { leaveTypeController as controller } from "../controllers/leave.controller.js";
import { LEAVE_TYPE_PERMISSIONS as can } from "../permissions/leave.permissions.js";
import { leaveTypeValidators as rules } from "../validators/leave.validator.js";

/* /api/v1/hr/leave-types */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:leaveTypeId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:leaveTypeId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:leaveTypeId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
