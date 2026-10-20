import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { nepPolicyController as controller } from "../controllers/nepPolicy.controller.js";
import { NEP_POLICY_PERMISSIONS as can } from "../permissions/nepPolicy.permissions.js";
import { nepPolicyValidators as rules } from "../validators/nepPolicy.validator.js";

/* /api/v1/academics/nep-policy: one per school */
const router = createRouter();

router.get("/", authorize(can.read), controller.get);
router.patch("/", authorize(can.manage), validate(rules.update), controller.update);

export default router;
