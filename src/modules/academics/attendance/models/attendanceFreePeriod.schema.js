import { relations, sql } from "drizzle-orm";
import { check, date, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { sections } from "../../sections/models/section.schema.js";

/* A free (leisure) period: on a period-wise day, the period's teacher is away and no
   teacher of the section covers it, so no register is taken. It is never a missing
   register and counts in nobody's attendance (periods held are registers taken).
   Removing one sets is_active = false; marking the period free again revives the row.
   Triggers (hand-written in the migration): a period is either free or has a register,
   never both (ZA409), and archived years are read-only. */
export const attendanceFreePeriods = pgTable(
  "attendance_free_periods",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    date: date("date").notNull(),
    periodNumber: integer("period_number").notNull(),
    reason: text("reason").notNull(),
    /* Who marked it (or last changed the reason), and when */
    markedBy: uuid("marked_by")
      .notNull()
      .references(() => users.id),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
    /* Set when an override role marked or removed it after the register locked */
    lockOverrideReason: text("lock_override_reason"),
    lockOverriddenBy: uuid("lock_overridden_by").references(() => users.id),
    lockOverriddenAt: timestamp("lock_overridden_at", { withTimezone: true })
  },
  t => [
    uniqueIndex("attendance_free_periods_section_date_period_uq").on(t.sectionId, t.date, t.periodNumber),
    check("attendance_free_periods_period_chk", sql`${t.periodNumber} BETWEEN 1 AND 20`)
  ]
);

export const attendanceFreePeriodsRelations = relations(attendanceFreePeriods, ({ one }) => ({
  section: one(sections, { fields: [attendanceFreePeriods.sectionId], references: [sections.id] })
}));
