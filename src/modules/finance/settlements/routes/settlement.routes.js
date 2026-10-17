import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { settlementController as controller } from "../controllers/settlement.controller.js";
import { SETTLEMENT_PERMISSIONS as can } from "../permissions/settlement.permissions.js";
import { settlementValidators as rules } from "../validators/settlement.validator.js";

/* /api/v1/finance/settlements: payouts from the payment gateway into the school's bank */
const router = createRouter();

router.get("/", authorize(can.read), validate(rules.list), controller.list);
/* Also runs daily on its own; this is "import now" */
router.post("/imports", authorize(can.import), validate(rules.import), controller.import);

export default router;
