import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

/* Privileged accounts: only admins create or change them */
export const STAFF_PERMISSIONS = definePermissions("users.staff", {
  create: [ROLES.ADMIN],
  read: ROLE_GROUPS.MANAGEMENT,
  update: [ROLES.ADMIN]
});
