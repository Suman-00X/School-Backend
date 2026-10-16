import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { reportController as controller } from "../controllers/report.controller.js";
import { REPORT_PERMISSIONS as can } from "../permissions/report.permissions.js";
import { reportValidators as rules } from "../validators/report.validator.js";

/* /api/v1/inventory/reports/* (JSON, or ?format=csv|xlsx) */
const router = createRouter();

router.get("/low-stock", authorize(can.read), validate(rules.lowStock), controller.lowStock);
router.get("/valuation", authorize(can.read), validate(rules.valuation), controller.valuation);
router.get("/consumption", authorize(can.read), validate(rules.consumption), controller.consumption);

export default router;
