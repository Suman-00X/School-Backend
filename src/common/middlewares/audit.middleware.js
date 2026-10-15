import { logAudit } from "../services/auditLog.service.js";

export const auditMiddleware = (entityType, action) => {
  return async (req, res, next) => {
    res.on("finish", async () => {
      if (!req.user) return;
      if (res.statusCode >= 400) return;

      await logAudit({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        role: req.user.role,
        action,
        entityType,
        entityId: res.locals?.entityId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        payload: req.body,
        ipAddress: req.ip
      });
    });

    next();
  };
};