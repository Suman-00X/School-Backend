import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

export const ENROLLMENT_PERMISSIONS = definePermissions("academics.enrollments", {
  create: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF],
  read: ROLE_GROUPS.ALL_EMPLOYEES,
  update: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF],
  promote: ROLE_GROUPS.MANAGEMENT
});
