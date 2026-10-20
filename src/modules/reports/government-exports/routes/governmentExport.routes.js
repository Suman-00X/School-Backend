import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { governmentExportController as controller } from "../controllers/governmentExport.controller.js";
import { GOVERNMENT_EXPORT_PERMISSIONS as can } from "../permissions/governmentExport.permissions.js";
import { governmentExportValidators as rules } from "../validators/governmentExport.validator.js";

/* /api/v1/reports/government-exports: UDISE+ and APAAR student files (?format=csv|xlsx),
   for schools whose NEP policy opts in (409 otherwise); the year from x-academic-year-id */
const router = createRouter();

router.get("/readiness", authorize(can.read), validate(rules.readiness), inYear, controller.readiness);
router.get("/udise", authorize(can.read), validate(rules.udise), inYear, controller.udise);
router.get("/apaar", authorize(can.read), validate(rules.apaar), inYear, controller.apaar);

export default router;
