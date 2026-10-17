import { auditLogs } from "../../../../common/audit/auditLog.query.js";

/* The central log: every module's activity (each module's own tab is /api/v1/<module>/activity) */
export const auditLogService = {
  /* Filters: which module, who, which permission, which record, method, when, words in the summary */
  list: (ctx, query) => auditLogs.list(ctx.tenantId, query),

  getById: (ctx, auditLogId) => auditLogs.getById(ctx.tenantId, auditLogId)
};
