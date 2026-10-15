import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ATTENDANCE_KEEPERS, EMPLOYEES } from "../../shared/constants/hr.permissions.js";

export const STAFF_ATTENDANCE_PERMISSIONS = definePermissions("hr.staffAttendance", {
  record: ATTENDANCE_KEEPERS,
  read: ATTENDANCE_KEEPERS,
  /* /hr/me/attendance */
  readOwn: EMPLOYEES
});
