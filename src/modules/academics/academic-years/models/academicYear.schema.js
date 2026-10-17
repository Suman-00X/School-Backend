import { sql } from "drizzle-orm";
import { boolean, check, date, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";

export const academicYears = pgTable(
  "academic_years",
  {
    ...baseColumns(),
    yearName: text("year_name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    /* Days with no school every week: 0 = Sunday … 6 = Saturday */
    weeklyOffDays: integer("weekly_off_days")
      .array()
      .notNull()
      .default(sql`'{0}'::integer[]`),
    description: text("description"),
    /* When it stopped being the current year: its teachers keep it for a grace period */
    currentUntil: timestamp("current_until", { withTimezone: true }),
    /* Archived years are read-only (enforced by database triggers, see migrations) */
    archivedAt: timestamp("archived_at", { withTimezone: true })
  },
  t => [
    uniqueIndex("academic_years_tenant_name_uq").on(t.tenantId, t.yearName),
    /* At most one current year per school */
    uniqueIndex("academic_years_one_current_uq")
      .on(t.tenantId)
      .where(sql`${t.isCurrent} = true`),
    check("academic_years_dates_chk", sql`${t.endDate} > ${t.startDate}`),
    check("academic_years_archived_not_current_chk", sql`NOT (${t.isCurrent} AND ${t.archivedAt} IS NOT NULL)`)
  ]
);
