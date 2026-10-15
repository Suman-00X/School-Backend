import { relations } from "drizzle-orm";
import { index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { sections } from "../../sections/models/section.schema.js";
import { subjects } from "../../subjects/models/subject.schema.js";

/* Subjects taught in a section (soft-deletable) */
export const sectionSubjects = pgTable(
  "section_subjects",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    displayCode: text("display_code").notNull(),
    weeklyNoOfClasses: integer("weekly_no_of_classes"),
    description: text("description")
  },
  t => [
    uniqueIndex("section_subjects_active_uq").on(t.sectionId, t.subjectId).where(activeRows(t)),
    uniqueIndex("section_subjects_display_code_uq").on(t.sectionId, t.displayCode).where(activeRows(t)),
    index("section_subjects_subject_idx").on(t.subjectId, t.academicYearId)
  ]
);

export const sectionSubjectsRelations = relations(sectionSubjects, ({ one }) => ({
  section: one(sections, { fields: [sectionSubjects.sectionId], references: [sections.id] }),
  subject: one(subjects, { fields: [sectionSubjects.subjectId], references: [subjects.id] })
}));
