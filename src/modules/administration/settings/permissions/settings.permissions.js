import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

export const SETTINGS_PERMISSIONS = definePermissions("administration.settings", {
  read: ROLE_GROUPS.STAFF_ROLES,
  update: [ROLES.ADMIN]
});
