import { sql } from "drizzle-orm";
import { date, pgEnum, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { ATTENDANCE_MODES } from "../../shared/constants/academic.constants.js";

export const attendanceMode = pgEnum("attendance_mode", ATTENDANCE_MODES);

/* How often the school takes attendance, from a date on. The mode is the same for every
   class. The rule in force on a date is the latest one starting on or before it; with
   none, the school is DAILY. A rule starts tomorrow (school time) at the earliest,
   enforced by a trigger, so a change never alters the meaning of registers already taken. */
export const attendanceModeRules = pgTable(
  "attendance_mode_rules",
  {
    ...baseColumns(),
    mode: attendanceMode("mode").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    setBy: uuid("set_by")
      .notNull()
      .references(() => users.id)
  },
  t => [
    uniqueIndex("attendance_mode_rules_school_uq")
      .on(t.tenantId, t.effectiveFrom)
      .where(sql`${t.isActive} = true`)
  ]
);
