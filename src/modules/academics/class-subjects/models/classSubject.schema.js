import { relations } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { classes } from "../../classes/models/class.schema.js";
import { subjects } from "../../subjects/models/subject.schema.js";

/* Subjects a class is taught in a year (soft-deletable). A required one goes to every section
   of the class as a section subject, including sections created later (a section may drop it);
   an optional one only to the sections it is given to. */
export const classSubjects = pgTable(
  "class_subjects",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    isOptional: boolean("is_optional").notNull().default(false),
    /* MA221: the subject's code, the class's place (subject-codes) and 1 required / 0 optional */
    code: text("code").notNull(),
    weeklyNoOfClasses: integer("weekly_no_of_classes"),
    description: text("description")
  },
  t => [
    uniqueIndex("class_subjects_active_uq").on(t.academicYearId, t.classId, t.subjectId).where(activeRows(t)),
    uniqueIndex("class_subjects_code_uq").on(t.tenantId, t.academicYearId, t.code).where(activeRows(t)),
    index("class_subjects_subject_idx").on(t.subjectId, t.academicYearId)
  ]
);

export const classSubjectsRelations = relations(classSubjects, ({ one }) => ({
  class: one(classes, { fields: [classSubjects.classId], references: [classes.id] }),
  subject: one(subjects, { fields: [classSubjects.subjectId], references: [subjects.id] })
}));
