import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { libraryPolicyController as controller } from "../controllers/libraryPolicy.controller.js";
import { LIBRARY_POLICY_PERMISSIONS as can } from "../permissions/libraryPolicy.permissions.js";
import { libraryPolicyValidators as rules } from "../validators/libraryPolicy.validator.js";

/* /api/v1/library/policy (a singleton per school) */
const router = createRouter();

router.get("/", authorize(can.read), controller.get);
router.patch("/", authorize(can.manage), validate(rules.update), controller.update);

export default router;
