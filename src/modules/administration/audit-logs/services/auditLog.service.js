import { createMongoRepository } from "../../../../common/database/mongoRepository.js";
import { notFound } from "../../../../common/http/errors.js";
import AuditLog from "../../../../common/audit/auditLog.model.js";

const auditLogRepository = createMongoRepository(AuditLog);

export const auditLogService = {
  /* Filters: who, which permission/module, which record, when */
  list: (ctx, { page, limit, userId, permission, entityId, method, from, to }) =>
    auditLogRepository.list(ctx.tenantId, {
      page,
      limit,
      filter: {
        ...(userId && { userId }),
        ...(permission && {
          permission: permission.endsWith(".") ? { $regex: `^${permission.replace(/\./g, "\\.")}` } : permission
        }),
        ...(entityId && { entityId }),
        ...(method && { method }),
        ...((from || to) && {
          createdAt: {
            ...(from && { $gte: new Date(`${from}T00:00:00Z`) }),
            ...(to && { $lte: new Date(`${to}T23:59:59Z`) })
          }
        })
      }
    }),

  getById: async (ctx, auditLogId) => {
    const entry = await auditLogRepository.findById(ctx.tenantId, auditLogId);
    if (!entry) throw notFound("Audit log entry");
    return entry;
  }
};
