import { createMongoRepository } from "../database/mongoRepository.js";
import { notFound } from "../http/errors.js";
import { z } from "../validation/zod.js";
import { date, id } from "../validation/schemas.js";
import AuditLog from "./auditLog.model.js";

/* Reading the audit trail: the central log (administration/audit-logs) and every module's
   activity tab (activity.routes.js) share these filters. Entries are never changed. */

const repository = createMongoRepository(AuditLog);

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* Query filters (zod), for listQuery() */
export const auditLogFilters = {
  userId: id().optional(),
  /* Exact key ("users.students.admit") or a prefix ending in a dot ("finance.") */
  permission: z
    .string()
    .regex(/^[a-zA-Z.]{2,100}$/, "must be a permission key or a prefix like finance.")
    .optional(),
  entityId: z.string().max(64).optional(),
  method: z.enum(["POST", "PUT", "PATCH", "DELETE"]).optional(),
  /* Inclusive days (UTC) */
  from: date().optional(),
  to: date().optional(),
  /* Words in the entry's summary, any casing: "Asha Rao" */
  search: z.string().trim().min(1).max(100).optional()
};

/* Any module, by key: "hostel", "finance" */
export const auditModuleFilter = () =>
  z
    .string()
    .regex(/^[a-z][a-zA-Z]{1,40}$/, "must be a module such as hostel or finance")
    .optional();

export const auditLogEntryParams = z.object({
  auditLogId: z.string().regex(/^[0-9a-f]{24}$/, "must be a valid id")
});

const filterOf = ({ module, userId, permission, entityId, method, from, to, search }) => ({
  ...(module && { module }),
  ...(userId && { userId }),
  ...(permission && {
    permission: permission.endsWith(".") ? { $regex: `^${escapeRegex(permission)}` } : permission
  }),
  ...(entityId && { entityId }),
  ...(method && { method }),
  ...((from || to) && {
    createdAt: {
      ...(from && { $gte: new Date(`${from}T00:00:00Z`) }),
      ...(to && { $lte: new Date(`${to}T23:59:59.999Z`) })
    }
  }),
  ...(search && { summary: { $regex: escapeRegex(search), $options: "i" } })
});

export const auditLogs = {
  /* Newest first -> { rows, meta } */
  list: (tenantId, { page, limit, ...filters }) =>
    repository.list(tenantId, { page, limit, filter: filterOf(filters) }),

  /* One entry; `module` limits it to that module's log */
  getById: async (tenantId, auditLogId, { module } = {}) => {
    const entry = await repository.findById(tenantId, auditLogId);
    if (!entry || (module && entry.module !== module)) throw notFound("Audit log entry");
    return entry;
  }
};
