import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ALL_ROLES, ROLES } from "../../../../common/auth/roles.js";

export const CREDENTIAL_PERMISSIONS = definePermissions("auth.credentials", {
  /* Privileged accounts can be invited by ADMIN only (checked in the service) */
  invite: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF],
  changeOwn: ALL_ROLES
});
