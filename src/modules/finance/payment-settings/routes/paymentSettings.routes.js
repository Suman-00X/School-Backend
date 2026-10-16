import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { paymentSettingsController as controller } from "../controllers/paymentSettings.controller.js";
import { PAYMENT_SETTINGS_PERMISSIONS as can } from "../permissions/paymentSettings.permissions.js";
import { paymentSettingsValidators as rules } from "../validators/paymentSettings.validator.js";

/* /api/v1/finance/payment-settings: the school's Razorpay keys (a singleton) */
const router = createRouter();

router.get("/", authorize(can.read), controller.get);
router.put("/", authorize(can.manage), validate(rules.replace), controller.replace);
router.delete("/", authorize(can.manage), controller.remove);
router.post("/connection-test", authorize(can.manage), controller.testConnection);

export default router;
