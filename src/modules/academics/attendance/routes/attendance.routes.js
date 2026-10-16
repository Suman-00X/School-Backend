import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { attendanceController as controller } from "../controllers/attendance.controller.js";
import { ATTENDANCE_PERMISSIONS as can } from "../permissions/attendance.permissions.js";
import { attendanceValidators as rules } from "../validators/attendance.validator.js";

/* /api/v1/academics/attendance. The section decides the academic year. */
const router = createRouter();

/* Recording is idempotent per (section, date, kind, period). The policy also sets the
   mode (DAILY, TWO_SESSIONS, PERIOD_WISE) per school and per class, from a date on. */
router.get("/policy", authorize(can.read), controller.getPolicy);
router.patch("/policy", authorize(can.managePolicy), validate(rules.updatePolicy), controller.updatePolicy);
router.post("/", authorize(can.record), validate(rules.record), controller.record);
router.get("/register", authorize(can.read), validate(rules.register), controller.register);
router.get("/summary", authorize(can.read), validate(rules.summary), controller.summary);
router.get("/students/:studentId", authorize(can.read), validate(rules.student), controller.student);

export default router;
