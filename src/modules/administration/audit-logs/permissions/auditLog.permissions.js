import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

/* The central log of every module: ADMIN only (a module's owners read its /activity tab) */
export const AUDIT_LOG_PERMISSIONS = definePermissions("administration.auditLogs", {
  read: { roles: [ROLES.ADMIN], label: "View the audit log of every module" }
});
