import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { staffAttendanceController as controller } from "../controllers/staffAttendance.controller.js";
import { STAFF_ATTENDANCE_PERMISSIONS as can } from "../permissions/staffAttendance.permissions.js";
import { staffAttendanceValidators as rules } from "../validators/staffAttendance.validator.js";

/* /api/v1/hr/staff-attendance */
export const staffAttendanceRoutes = createRouter();

/* Idempotent per (employee, date) */
staffAttendanceRoutes.post("/", authorize(can.record), validate(rules.record), controller.record);
staffAttendanceRoutes.get("/register", authorize(can.read), validate(rules.register), controller.register);
staffAttendanceRoutes.get("/summary", authorize(can.read), validate(rules.summary), controller.summary);

/* /api/v1/hr/me/attendance */
export const myAttendanceRoutes = createRouter();
myAttendanceRoutes.get("/attendance", authorize(can.readOwn), validate(rules.mine), controller.mine);
