import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ALL_ROLES } from "../../../../common/auth/roles.js";

/* Everyone manages their own sessions */
export const SESSION_PERMISSIONS = definePermissions("auth.sessions", {
  manageOwn: ALL_ROLES
});
