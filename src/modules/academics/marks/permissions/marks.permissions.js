import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

export const MARKS_PERMISSIONS = definePermissions("academics.marks", {
  record: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER],
  read: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.TEACHER]
});
