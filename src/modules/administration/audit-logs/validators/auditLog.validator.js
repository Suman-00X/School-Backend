import { auditLogEntryParams, auditLogFilters, auditModuleFilter } from "../../../../common/audit/auditLog.query.js";
import { listQuery } from "../../../../common/validation/schemas.js";

export const auditLogValidators = {
  /* The filters of a module's activity tab, plus the module */
  list: { query: listQuery({ module: auditModuleFilter(), ...auditLogFilters }) },
  getById: { params: auditLogEntryParams }
};
