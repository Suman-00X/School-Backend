import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { accountController as controller } from "../controllers/account.controller.js";
import { ACCOUNT_PERMISSIONS as can } from "../permissions/account.permissions.js";
import { accountValidators as rules } from "../validators/account.validator.js";

/* /api/v1/users: every account, whatever its role */
const router = createRouter();

router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:userId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:userId", authorize(can.update), validate(rules.update), controller.update);
router.delete("/:userId", authorize(can.deactivate), validate(rules.deactivate), controller.deactivate);

export default router;
