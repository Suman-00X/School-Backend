import { relations, sql } from "drizzle-orm";
import { check, date, pgEnum, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { classes } from "../../classes/models/class.schema.js";
import { ATTENDANCE_MODES } from "../../shared/constants/academic.constants.js";

export const attendanceMode = pgEnum("attendance_mode", ATTENDANCE_MODES);

/* How often attendance is taken, from a date on: the school's mode (class_id NULL)
   or one class's override (mode NULL = follow the school again). The rule in force on
   a date is the latest one starting on or before it; with none, the school is DAILY.
   A rule starts tomorrow (school time) at the earliest, enforced by a trigger, so a
   change never alters the meaning of registers already taken. */
export const attendanceModeRules = pgTable(
  "attendance_mode_rules",
  {
    ...baseColumns(),
    classId: uuid("class_id").references(() => classes.id),
    mode: attendanceMode("mode"),
    effectiveFrom: date("effective_from").notNull(),
    setBy: uuid("set_by")
      .notNull()
      .references(() => users.id)
  },
  t => [
    uniqueIndex("attendance_mode_rules_school_uq")
      .on(t.tenantId, t.effectiveFrom)
      .where(sql`${t.isActive} = true AND ${t.classId} IS NULL`),
    uniqueIndex("attendance_mode_rules_class_uq")
      .on(t.classId, t.effectiveFrom)
      .where(sql`${t.isActive} = true AND ${t.classId} IS NOT NULL`),
    check("attendance_mode_rules_school_mode_chk", sql`${t.classId} IS NOT NULL OR ${t.mode} IS NOT NULL`)
  ]
);

export const attendanceModeRulesRelations = relations(attendanceModeRules, ({ one }) => ({
  class: one(classes, { fields: [attendanceModeRules.classId], references: [classes.id] })
}));
