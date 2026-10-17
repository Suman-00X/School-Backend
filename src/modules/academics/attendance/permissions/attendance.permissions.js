import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

/* Teachers are further limited to the sections they teach (teachingScope): daily and
   half-day registers by the class teacher or deputy; period registers by any teacher
   who takes the class. Missing registers: a teacher sees the ones they answer for. */
export const ATTENDANCE_PERMISSIONS = definePermissions("academics.attendance", {
  record: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER],
  read: ROLE_GROUPS.ALL_EMPLOYEES,
  readMissingRegisters: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER],
  managePolicy: [ROLES.ADMIN]
});
