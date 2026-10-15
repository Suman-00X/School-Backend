import { relations } from "drizzle-orm";
import { boolean, index, pgEnum, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { parents } from "../../parents/models/parent.schema.js";
import { PARENT_RELATIONS } from "../../shared/constants/user.constants.js";
import { students } from "./student.schema.js";

export const parentRelation = pgEnum("parent_relation", PARENT_RELATIONS);

/* Which parents/guardians belong to which student (soft-deletable link) */
export const studentParents = pgTable(
  "student_parents",
  {
    ...baseColumns(),
    studentId: uuid("student_id").notNull().references(() => students.id),
    parentId: uuid("parent_id").notNull().references(() => parents.id),
    relation: parentRelation("relation").notNull(),
    isPrimaryContact: boolean("is_primary_contact").notNull().default(false)
  },
  t => [
    uniqueIndex("student_parents_active_uq").on(t.studentId, t.parentId).where(activeRows(t)),
    index("student_parents_parent_idx").on(t.parentId)
  ]
);

export const studentParentsRelations = relations(studentParents, ({ one }) => ({
  student: one(students, { fields: [studentParents.studentId], references: [students.id] }),
  parent: one(parents, { fields: [studentParents.parentId], references: [parents.id] })
}));
