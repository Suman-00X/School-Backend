import { relations } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { teachers } from "../../../users/teachers/models/teacher.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { sections } from "../../sections/models/section.schema.js";
import { subjects } from "../../subjects/models/subject.schema.js";

/* Who teaches a subject in a section (soft-deletable) */
export const teacherAssignments = pgTable(
  "teacher_assignments",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    description: text("description")
  },
  t => [
    /* One teacher per subject per section */
    uniqueIndex("teacher_assignments_active_uq").on(t.sectionId, t.subjectId).where(activeRows(t)),
    index("teacher_assignments_teacher_idx").on(t.teacherId, t.academicYearId)
  ]
);

export const teacherAssignmentsRelations = relations(teacherAssignments, ({ one }) => ({
  teacher: one(teachers, { fields: [teacherAssignments.teacherId], references: [teachers.id] }),
  section: one(sections, { fields: [teacherAssignments.sectionId], references: [sections.id] }),
  subject: one(subjects, { fields: [teacherAssignments.subjectId], references: [subjects.id] })
}));
