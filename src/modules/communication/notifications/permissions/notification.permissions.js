import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ALL_ROLES, ROLES } from "../../../../common/auth/roles.js";

export const NOTIFICATION_PERMISSIONS = definePermissions("communication.notifications", {
  send: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF],
  /* Everyone has an inbox */
  inbox: ALL_ROLES
});
