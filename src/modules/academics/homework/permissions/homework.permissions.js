import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

/* Teachers are further limited to subjects they teach in the section (teachingScope) */
export const HOMEWORK_PERMISSIONS = definePermissions("academics.homework", {
  manage: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER],
  read: ROLE_GROUPS.ALL_EMPLOYEES,
  grade: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER]
});
