import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { teachers } from "../../../users/teachers/models/teacher.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { classes } from "../../classes/models/class.schema.js";

/* A class's division within one academic year (Class 1 - A, 2026-27) */
export const sections = pgTable(
  "sections",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id),
    sectionName: text("section_name").notNull(),
    capacity: integer("capacity"),
    classTeacherId: uuid("class_teacher_id").references(() => teachers.id),
    description: text("description")
  },
  t => [
    uniqueIndex("sections_year_class_name_uq").on(t.academicYearId, t.classId, t.sectionName),
    index("sections_class_teacher_idx").on(t.classTeacherId, t.academicYearId),
    check("sections_capacity_chk", sql`${t.capacity} IS NULL OR ${t.capacity} > 0`)
  ]
);

export const sectionsRelations = relations(sections, ({ one }) => ({
  academicYear: one(academicYears, { fields: [sections.academicYearId], references: [academicYears.id] }),
  class: one(classes, { fields: [sections.classId], references: [classes.id] }),
  classTeacher: one(teachers, { fields: [sections.classTeacherId], references: [teachers.id] })
}));
