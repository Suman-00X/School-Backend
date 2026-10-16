import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { stockCheckController as controller } from "../controllers/stockCheck.controller.js";
import { STOCK_CHECK_PERMISSIONS as can } from "../permissions/stockCheck.permissions.js";
import { stockCheckValidators as rules } from "../validators/stockCheck.validator.js";

/* /api/v1/library/stock-checks: stock-taking */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.start), controller.start);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:stockCheckId", authorize(can.read), validate(rules.getById), controller.getById);
router.post("/:stockCheckId/scans", authorize(can.manage), validate(rules.scan), controller.scan);
router.get("/:stockCheckId/missing", authorize(can.read), validate(rules.missing), controller.missing);
router.get("/:stockCheckId/unexpected", authorize(can.read), validate(rules.unexpected), controller.unexpected);
router.post("/:stockCheckId/closure", authorize(can.manage), validate(rules.close), controller.close);

export default router;
