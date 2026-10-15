import { relations, sql } from "drizzle-orm";
import { check, date, index, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { sections } from "../../sections/models/section.schema.js";
import { subjects } from "../../subjects/models/subject.schema.js";
import { exams } from "./exam.schema.js";

export const score = name => numeric(name, { precision: 6, scale: 2, mode: "number" });

/* One paper: a subject a section sits in an exam, with its max/pass marks */
export const examPapers = pgTable(
  "exam_papers",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id").notNull().references(() => academicYears.id),
    examId: uuid("exam_id").notNull().references(() => exams.id),
    sectionId: uuid("section_id").notNull().references(() => sections.id),
    subjectId: uuid("subject_id").notNull().references(() => subjects.id),
    displayCode: text("display_code").notNull(),
    examDate: date("exam_date"),
    maxMarks: score("max_marks").notNull(),
    passMarks: score("pass_marks"),
    description: text("description")
  },
  t => [
    uniqueIndex("exam_papers_exam_section_subject_uq").on(t.examId, t.sectionId, t.subjectId),
    uniqueIndex("exam_papers_exam_section_code_uq").on(t.examId, t.sectionId, t.displayCode),
    index("exam_papers_section_date_idx").on(t.sectionId, t.examDate),
    check("exam_papers_marks_chk", sql`${t.maxMarks} > 0 AND (${t.passMarks} IS NULL OR ${t.passMarks} BETWEEN 0 AND ${t.maxMarks})`)
  ]
);

export const examPapersRelations = relations(examPapers, ({ one }) => ({
  exam: one(exams, { fields: [examPapers.examId], references: [exams.id] }),
  section: one(sections, { fields: [examPapers.sectionId], references: [sections.id] }),
  subject: one(subjects, { fields: [examPapers.subjectId], references: [subjects.id] })
}));
