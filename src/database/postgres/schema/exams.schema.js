import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { academicYears, sections, subjects } from "./academics.schema.js";
import { isActive, primaryId, timestamps } from "./columns.js";
import { examType } from "./enums.js";
import { students, teachers } from "./people.schema.js";
import { tenantId } from "./tenancy.schema.js";

const score = name => numeric(name, { precision: 6, scale: 2, mode: "number" });

export const exams = pgTable(
  "exams",
  {
    id: primaryId(),
    tenantId: tenantId(),
    academicYearId: uuid("academic_year_id").notNull().references(() => academicYears.id),
    examName: text("exam_name").notNull(),
    examType: examType("exam_type"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    description: text("description"),
    isActive: isActive(),
    ...timestamps()
  },
  t => [
    uniqueIndex("exams_year_name_uq").on(t.academicYearId, t.examName),
    check(
      "exams_dates_chk",
      sql`${t.startDate} IS NULL OR ${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`
    )
  ]
);

/* A subject paper a section sits in an exam (API: exam-section-subject-map) */
export const examSubjects = pgTable(
  "exam_subjects",
  {
    id: primaryId(),
    tenantId: tenantId(),
    academicYearId: uuid("academic_year_id").notNull().references(() => academicYears.id),
    examId: uuid("exam_id").notNull().references(() => exams.id),
    sectionId: uuid("section_id").notNull().references(() => sections.id),
    subjectId: uuid("subject_id").notNull().references(() => subjects.id),
    displayCode: text("display_code").notNull(),
    examDate: date("exam_date"),
    maxMarks: score("max_marks").notNull(),
    passMarks: score("pass_marks"),
    description: text("description"),
    isActive: isActive(),
    ...timestamps()
  },
  t => [
    uniqueIndex("exam_subjects_exam_section_subject_uq").on(t.examId, t.sectionId, t.subjectId),
    uniqueIndex("exam_subjects_exam_section_code_uq").on(t.examId, t.sectionId, t.displayCode),
    index("exam_subjects_section_date_idx").on(t.sectionId, t.examDate),
    check("exam_subjects_marks_chk", sql`${t.maxMarks} > 0 AND (${t.passMarks} IS NULL OR ${t.passMarks} BETWEEN 0 AND ${t.maxMarks})`)
  ]
);

export const marks = pgTable(
  "marks",
  {
    id: primaryId(),
    tenantId: tenantId(),
    academicYearId: uuid("academic_year_id").notNull().references(() => academicYears.id),
    studentId: uuid("student_id").notNull().references(() => students.id),
    examSubjectId: uuid("exam_subject_id").notNull().references(() => examSubjects.id),
    marksObtained: score("marks_obtained"),
    grade: text("grade"),
    isAbsent: boolean("is_absent").notNull().default(false),
    evaluatedBy: uuid("evaluated_by").references(() => teachers.id),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
    remarks: text("remarks"),
    isActive: isActive(),
    ...timestamps()
  },
  t => [
    /* One entry per student per exam paper (also the upsert target) */
    uniqueIndex("marks_student_exam_subject_uq").on(t.studentId, t.examSubjectId),
    index("marks_year_student_idx").on(t.academicYearId, t.studentId),
    index("marks_exam_subject_idx").on(t.examSubjectId),
    check("marks_obtained_chk", sql`${t.marksObtained} IS NULL OR ${t.marksObtained} >= 0`)
  ]
);
