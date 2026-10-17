import { definePermissions, authorize } from "../auth/authorize.middleware.js";
import { titleOf } from "../auth/catalogue.js";
import { ROLES } from "../auth/roles.js";
import { ok, paginated } from "../http/responses.js";
import { createRouter } from "../http/router.js";
import { validate } from "../validation/validate.middleware.js";
import { listQuery } from "../validation/schemas.js";
import { auditLogEntryParams, auditLogFilters, auditLogs } from "./auditLog.query.js";

/* A module's activity tab: its slice of the audit trail, with the central log's filters
   (module aside). Each module mounts one at /api/v1/<module>/activity:

     router.use("/activity", activityRoutes("hostel"));

   Permission "<module>.activity.read": ADMIN by role, and the module's owners, who hold every
   permission of their module (administration/access). Owner-only, so never given to an
   operator; everyone else gets 403. Entries are read-only. */
export const activityRoutes = (module, { label = titleOf(module) } = {}) => {
  const can = definePermissions(`${module}.activity`, {
    read: { roles: [ROLES.ADMIN], ownerOnly: true, label: `View the ${label} activity log` }
  });
  const router = createRouter();

  router.get("/", authorize(can.read), validate({ query: listQuery(auditLogFilters) }), async (req, res) =>
    paginated(
      res,
      await auditLogs.list(req.context.tenantId, { ...req.query, module }),
      `${label} activity retrieved successfully`
    )
  );

  router.get("/:auditLogId", authorize(can.read), validate({ params: auditLogEntryParams }), async (req, res) =>
    ok(
      res,
      await auditLogs.getById(req.context.tenantId, req.params.auditLogId, { module }),
      "Activity entry retrieved successfully"
    )
  );

  return router;
};
