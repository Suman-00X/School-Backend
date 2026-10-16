import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { lateFeeRuleController as controller } from "../controllers/lateFeeRule.controller.js";
import { LATE_FEE_RULE_PERMISSIONS as can } from "../permissions/lateFeeRule.permissions.js";
import { lateFeeRuleValidators as rules } from "../validators/lateFeeRule.validator.js";

/* /api/v1/finance/late-fee-rules */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:lateFeeRuleId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:lateFeeRuleId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:lateFeeRuleId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
