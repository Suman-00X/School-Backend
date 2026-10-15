import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

export const AUDIT_LOG_PERMISSIONS = definePermissions("administration.auditLogs", { read: [ROLES.ADMIN] });
