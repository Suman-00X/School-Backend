import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { feeHeadController as controller } from "../controllers/feeHead.controller.js";
import { FEE_HEAD_PERMISSIONS as can } from "../permissions/feeHead.permissions.js";
import { feeHeadValidators as rules } from "../validators/feeHead.validator.js";

/* /api/v1/finance/fee-heads */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:feeHeadId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:feeHeadId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:feeHeadId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
