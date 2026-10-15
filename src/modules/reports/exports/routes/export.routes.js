import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { exportController as controller } from "../controllers/export.controller.js";
import { EXPORT_PERMISSIONS as can } from "../permissions/export.permissions.js";
import { exportValidators as rules } from "../validators/export.validator.js";

/* /api/v1/reports/exports/* -> file downloads (?format=csv|xlsx) */
const router = createRouter();

router.get("/students", authorize(can.students), validate(rules.students), inYear, controller.students);
router.get("/attendance", authorize(can.attendance), validate(rules.attendance), controller.attendance);
router.get("/fee-collections", authorize(can.fees), validate(rules.feeCollections), controller.feeCollections);
router.get("/fee-defaulters", authorize(can.fees), validate(rules.defaulters), inYear, controller.defaulters);
router.get("/results", authorize(can.results), validate(rules.results), controller.results);

export default router;
