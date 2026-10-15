import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

/* Teachers are further limited to the sections they teach (teachingScope) */
export const ATTENDANCE_PERMISSIONS = definePermissions("academics.attendance", {
  record: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER],
  read: ROLE_GROUPS.ALL_EMPLOYEES
});
