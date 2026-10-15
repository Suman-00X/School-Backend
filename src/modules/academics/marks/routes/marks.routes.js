import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { marksController as controller } from "../controllers/marks.controller.js";
import { MARKS_PERMISSIONS as can } from "../permissions/marks.permissions.js";
import { marksValidators as rules } from "../validators/marks.validator.js";

/* /api/v1/academics/marks */
const router = createRouter();

/* Recording is idempotent per (student, paper): creates or updates */
router.post("/", authorize(can.record), validate(rules.record), controller.record);
router.post("/bulk", authorize(can.record), validate(rules.recordMany), controller.recordMany);
router.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);

export default router;
