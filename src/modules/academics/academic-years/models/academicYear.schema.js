import { sql } from "drizzle-orm";
import { boolean, check, date, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";

export const academicYears = pgTable(
  "academic_years",
  {
    ...baseColumns(),
    yearName: text("year_name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    description: text("description")
  },
  t => [
    uniqueIndex("academic_years_tenant_name_uq").on(t.tenantId, t.yearName),
    /* At most one current year per school */
    uniqueIndex("academic_years_one_current_uq")
      .on(t.tenantId)
      .where(sql`${t.isCurrent} = true`),
    check("academic_years_dates_chk", sql`${t.endDate} > ${t.startDate}`)
  ]
);
