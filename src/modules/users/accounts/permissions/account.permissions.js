import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

export const ACCOUNT_PERMISSIONS = definePermissions("users.accounts", {
  read: ROLE_GROUPS.MANAGEMENT,
  update: [ROLES.ADMIN],
  deactivate: [ROLES.ADMIN]
});
