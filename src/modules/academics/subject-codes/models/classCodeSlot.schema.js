import { relations, sql } from "drizzle-orm";
import { check, integer, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { classes } from "../../classes/models/class.schema.js";

/* Each class's place in the school's subject codes (Policy › Subject codes): its stage and
   its position in the stage, the two middle digits of MA221. Not per year: a class's codes
   stay the same every year. A place moves only while none of the class's codes is in use. */
export const classCodeSlots = pgTable(
  "class_code_slots",
  {
    ...baseColumns(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id),
    stage: integer("stage").notNull(),
    position: integer("position").notNull()
  },
  t => [
    uniqueIndex("class_code_slots_class_uq").on(t.tenantId, t.classId),
    uniqueIndex("class_code_slots_place_uq").on(t.tenantId, t.stage, t.position),
    check("class_code_slots_digits_chk", sql`${t.stage} BETWEEN 1 AND 9 AND ${t.position} BETWEEN 1 AND 9`)
  ]
);

export const classCodeSlotsRelations = relations(classCodeSlots, ({ one }) => ({
  class: one(classes, { fields: [classCodeSlots.classId], references: [classes.id] })
}));
