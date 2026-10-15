import { ok, paginated } from "../../../../common/http/responses.js";
import { auditLogService } from "../services/auditLog.service.js";

export const auditLogController = {
  list: async (req, res) =>
    paginated(res, await auditLogService.list(req.context, req.query), "Audit log retrieved successfully"),
  getById: async (req, res) =>
    ok(res, await auditLogService.getById(req.context, req.params.auditLogId), "Audit log entry retrieved successfully")
};
