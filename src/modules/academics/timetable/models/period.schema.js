import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, time, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";

/* The bell schedule of an academic year: Period 1 08:30–09:15, Lunch, … */
export const periods = pgTable(
  "periods",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    periodNumber: integer("period_number").notNull(),
    name: text("name").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    /* Breaks (recess, lunch) cannot hold classes */
    isBreak: boolean("is_break").notNull().default(false)
  },
  t => [
    uniqueIndex("periods_year_number_uq")
      .on(t.academicYearId, t.periodNumber)
      .where(sql`${t.isActive} = true`),
    check("periods_times_chk", sql`${t.endTime} > ${t.startTime}`)
  ]
);
