import AuditLog from "../../../../common/audit/auditLog.model.js";
import { logger } from "../../../../common/logging/logger.js";

/* Sign-in events go to the audit trail too (the audit middleware only sees signed-in writes).
   A failure to record never breaks sign-in. */
export const auditAuth = ({ tenantId, userId, role, event, statusCode, ipAddress }) =>
  AuditLog.create({
    tenantId,
    userId: userId ?? "unknown",
    role,
    permission: `auth.${event}`,
    method: "POST",
    path: `/api/v1/auth/${event}`,
    statusCode,
    ipAddress
  }).catch(error => logger.warn({ err: error }, "Could not record auth event"));
