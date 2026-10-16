import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { circulationRuleController as controller } from "../controllers/circulationRule.controller.js";
import { CIRCULATION_RULE_PERMISSIONS as can } from "../permissions/circulationRule.permissions.js";
import { circulationRuleValidators as rules } from "../validators/circulationRule.validator.js";

/* /api/v1/library/circulation-rules */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:ruleId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:ruleId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:ruleId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
