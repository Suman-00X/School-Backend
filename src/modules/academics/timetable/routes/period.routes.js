import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { periodController as controller } from "../controllers/period.controller.js";
import { TIMETABLE_PERMISSIONS as can } from "../permissions/timetable.permissions.js";
import { timetableValidators as rules } from "../validators/timetable.validator.js";

/* /api/v1/academics/periods: the bell schedule of an academic year */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.createPeriod), inYear, controller.create);
router.get("/", authorize(can.read), validate(rules.listPeriods), inYear, controller.list);
router.patch("/:periodId", authorize(can.manage), validate(rules.updatePeriod), controller.update);
router.delete("/:periodId", authorize(can.manage), validate(rules.removePeriod), controller.remove);

export default router;
