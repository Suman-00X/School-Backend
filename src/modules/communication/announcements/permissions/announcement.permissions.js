import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

export const ANNOUNCEMENT_PERMISSIONS = definePermissions("communication.announcements", {
  manage: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF],
  read: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF, ROLES.ACCOUNTANT]
});
