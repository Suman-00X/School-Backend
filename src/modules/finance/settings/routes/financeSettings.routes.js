import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { financeSettingsController as controller } from "../controllers/financeSettings.controller.js";
import { FINANCE_SETTINGS_PERMISSIONS as can } from "../permissions/financeSettings.permissions.js";
import { financeSettingsValidators as rules } from "../validators/financeSettings.validator.js";

/* /api/v1/finance/settings: the school's finance settings (a singleton) */
const router = createRouter();

router.get("/", authorize(can.read), controller.get);
router.patch("/", authorize(can.manage), validate(rules.update), controller.update);

export default router;
