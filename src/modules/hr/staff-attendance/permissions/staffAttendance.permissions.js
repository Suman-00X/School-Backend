import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ATTENDANCE_KEEPERS, EMPLOYEES } from "../../shared/constants/hr.permissions.js";

export const STAFF_ATTENDANCE_PERMISSIONS = definePermissions("hr.staffAttendance", {
  record: { roles: ATTENDANCE_KEEPERS, label: "Mark staff attendance" },
  read: { roles: ATTENDANCE_KEEPERS, label: "View the staff attendance register and summary" },
  /* /hr/me/attendance */
  readOwn: { roles: EMPLOYEES, selfService: true, label: "View own attendance" }
});
