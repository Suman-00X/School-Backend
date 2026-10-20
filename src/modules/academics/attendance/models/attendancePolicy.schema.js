import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";

/* One per school (created with defaults on first read).
   A register can be taken or changed until `edit_window_days` after its date;
   after that it is locked and only `override_roles` may change it, giving a reason.
   How often attendance is taken (the mode) is scheduled in attendance_mode_rules. */
export const attendancePolicies = pgTable(
  "attendance_policies",
  {
    ...baseColumns(),
    editWindowDays: integer("edit_window_days").notNull().default(2),
    overrideRoles: text("override_roles")
      .array()
      .notNull()
      .default(sql`'{ADMIN}'::text[]`),
    /* Period-wise attendance: a day counts as present when at least this % of its periods was attended */
    periodPresenceThreshold: integer("period_presence_threshold").notNull().default(50),
    /* Low attendance: a student under this % of the year so far is flagged to their teachers
       and parents, once they have at least `low_attendance_min_days` countable days */
    lowAttendanceThreshold: integer("low_attendance_threshold").notNull().default(75),
    lowAttendanceMinDays: integer("low_attendance_min_days").notNull().default(10)
  },
  t => [
    uniqueIndex("attendance_policies_tenant_uq").on(t.tenantId),
    check("attendance_policies_window_chk", sql`${t.editWindowDays} BETWEEN 0 AND 365`),
    check(
      "attendance_policies_roles_chk",
      sql`${t.overrideRoles} <@ ARRAY['ADMIN','PRINCIPAL']::text[] AND cardinality(${t.overrideRoles}) > 0`
    ),
    check("attendance_policies_threshold_chk", sql`${t.periodPresenceThreshold} BETWEEN 1 AND 100`),
    check("attendance_policies_low_threshold_chk", sql`${t.lowAttendanceThreshold} BETWEEN 1 AND 100`),
    check("attendance_policies_low_min_days_chk", sql`${t.lowAttendanceMinDays} BETWEEN 1 AND 365`)
  ]
);
