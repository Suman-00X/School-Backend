import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { staffController as controller } from "../controllers/staff.controller.js";
import { STAFF_PERMISSIONS as can } from "../permissions/staff.permissions.js";
import { staffValidators as rules } from "../validators/staff.validator.js";

/* /api/v1/users/staff: privileged users (ADMIN, PRINCIPAL, ACCOUNTANT, STAFF) */
const router = createRouter();

router.post("/", authorize(can.create), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:staffId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:staffId", authorize(can.update), validate(rules.update), controller.update);

export default router;
