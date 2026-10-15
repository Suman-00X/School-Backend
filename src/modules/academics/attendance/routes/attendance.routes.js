import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { attendanceController as controller } from "../controllers/attendance.controller.js";
import { ATTENDANCE_PERMISSIONS as can } from "../permissions/attendance.permissions.js";
import { attendanceValidators as rules } from "../validators/attendance.validator.js";

/* /api/v1/academics/attendance. The section decides the academic year. */
const router = createRouter();

/* Recording is idempotent per (section, date, period) */
router.post("/", authorize(can.record), validate(rules.record), controller.record);
router.get("/register", authorize(can.read), validate(rules.register), controller.register);
router.get("/summary", authorize(can.read), validate(rules.summary), controller.summary);
router.get("/students/:studentId", authorize(can.read), validate(rules.student), controller.student);

export default router;
