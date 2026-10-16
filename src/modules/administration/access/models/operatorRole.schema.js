import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { ACCESS_MODULE_KEYS, MAX_ROLE_PERMISSIONS } from "../../shared/constants/access.constants.js";

export const accessModule = pgEnum("access_module", ACCESS_MODULE_KEYS);

/* A school-defined set of permissions from ONE add-on module, given to operators
   ("Transport desk": view routes, assign students, print rosters).
   Every permission key belongs to the role's module (checked here) and exists in the
   catalogue and may be given to operators (checked by the service). */
export const operatorRoles = pgTable(
  "operator_roles",
  {
    ...baseColumns(),
    module: accessModule("module").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /* Permission keys, e.g. "transport.routes.read" */
    permissions: text("permissions").array().notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id)
  },
  t => [
    uniqueIndex("operator_roles_tenant_module_name_uq")
      .on(t.tenantId, t.module, sql`lower(${t.name})`)
      .where(activeRows(t)),
    index("operator_roles_tenant_module_idx").on(t.tenantId, t.module),
    check(
      "operator_roles_permissions_count_chk",
      sql`cardinality(${t.permissions}) BETWEEN 1 AND ${sql.raw(String(MAX_ROLE_PERMISSIONS))}`
    ),
    check(
      "operator_roles_permissions_module_chk",
      sql`array_to_string(${t.permissions}, ',') ~ ('^' || ${t.module}::text || '\\.[A-Za-z0-9.]+(,' || ${t.module}::text || '\\.[A-Za-z0-9.]+)*$')`
    )
  ]
);
