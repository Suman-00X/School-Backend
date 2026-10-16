import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";

/* One per school (created with defaults on first read).
   A register can be taken or changed until `edit_window_days` after its date;
   after that it is locked and only `override_roles` may change it, giving a reason. */
export const attendancePolicies = pgTable(
  "attendance_policies",
  {
    ...baseColumns(),
    editWindowDays: integer("edit_window_days").notNull().default(2),
    overrideRoles: text("override_roles")
      .array()
      .notNull()
      .default(sql`'{ADMIN}'::text[]`)
  },
  t => [
    uniqueIndex("attendance_policies_tenant_uq").on(t.tenantId),
    check("attendance_policies_window_chk", sql`${t.editWindowDays} BETWEEN 0 AND 365`),
    check(
      "attendance_policies_roles_chk",
      sql`${t.overrideRoles} <@ ARRAY['ADMIN','PRINCIPAL']::text[] AND cardinality(${t.overrideRoles}) > 0`
    )
  ]
);
