import { relations, sql } from "drizzle-orm";
import { check, date, index, numeric, pgEnum, pgTable, text, time, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { sections } from "../../sections/models/section.schema.js";
import { subjects } from "../../subjects/models/subject.schema.js";
import { PAPER_COMPONENTS, PAPER_GRADING_TYPES } from "../../shared/constants/academic.constants.js";
import { exams } from "./exam.schema.js";

export const score = name => numeric(name, { precision: 6, scale: 2, mode: "number" });

export const paperGradingType = pgEnum("paper_grading_type", PAPER_GRADING_TYPES);
export const paperComponent = pgEnum("paper_component", PAPER_COMPONENTS);

/* One paper: a subject a section sits in an exam, with its max/pass marks.
   A subject may be split into components (THEORY + PRACTICAL), one paper each.
   GRADE papers (Art, Conduct) have no marks: teachers record a grade only. */
export const examPapers = pgTable(
  "exam_papers",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    component: paperComponent("component"),
    gradingType: paperGradingType("grading_type").notNull().default("MARKS"),
    displayCode: text("display_code").notNull(),
    examDate: date("exam_date"),
    startTime: time("start_time"),
    endTime: time("end_time"),
    room: text("room"),
    maxMarks: score("max_marks"),
    passMarks: score("pass_marks"),
    description: text("description")
  },
  t => [
    /* One whole paper per subject, or one paper per component */
    uniqueIndex("exam_papers_exam_section_subject_uq")
      .on(t.examId, t.sectionId, t.subjectId)
      .where(sql`${t.component} IS NULL AND ${t.isActive} = true`),
    uniqueIndex("exam_papers_exam_section_subject_component_uq")
      .on(t.examId, t.sectionId, t.subjectId, t.component)
      .where(sql`${t.component} IS NOT NULL AND ${t.isActive} = true`),
    uniqueIndex("exam_papers_exam_section_code_uq")
      .on(t.examId, t.sectionId, t.displayCode)
      .where(sql`${t.isActive} = true`),
    index("exam_papers_section_date_idx").on(t.sectionId, t.examDate),
    check(
      "exam_papers_times_chk",
      sql`${t.startTime} IS NULL OR ${t.endTime} IS NULL OR ${t.endTime} > ${t.startTime}`
    ),
    check(
      "exam_papers_marks_chk",
      sql`(${t.gradingType} = 'MARKS' AND ${t.maxMarks} > 0 AND (${t.passMarks} IS NULL OR ${t.passMarks} BETWEEN 0 AND ${t.maxMarks}))
        OR (${t.gradingType} = 'GRADE' AND ${t.maxMarks} IS NULL AND ${t.passMarks} IS NULL)`
    )
  ]
);

export const examPapersRelations = relations(examPapers, ({ one }) => ({
  exam: one(exams, { fields: [examPapers.examId], references: [exams.id] }),
  section: one(sections, { fields: [examPapers.sectionId], references: [sections.id] }),
  subject: one(subjects, { fields: [examPapers.subjectId], references: [subjects.id] })
}));
