import { relations, sql } from "drizzle-orm";
import { boolean, check, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { students } from "../../../users/students/models/student.schema.js";
import { teachers } from "../../../users/teachers/models/teacher.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { examPapers, score } from "../../exams/models/examPaper.schema.js";
import { ABSENCE_REASONS } from "../../shared/constants/academic.constants.js";

export const absenceReason = pgEnum("absence_reason", ABSENCE_REASONS);

/* A student's result in one exam paper */
export const marks = pgTable(
  "marks",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    examPaperId: uuid("exam_paper_id")
      .notNull()
      .references(() => examPapers.id),
    marksObtained: score("marks_obtained"),
    grade: text("grade"),
    /* true: the grade was given by the teacher (always for GRADE papers); false: computed from marks */
    gradeIsManual: boolean("grade_is_manual").notNull().default(false),
    isAbsent: boolean("is_absent").notNull().default(false),
    /* Why (result policies treat MEDICAL and EXEMPT differently); null on old rows means ABSENT */
    absenceReason: absenceReason("absence_reason"),
    evaluatedBy: uuid("evaluated_by").references(() => teachers.id),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
    remarks: text("remarks")
  },
  t => [
    /* One entry per student per paper (also the upsert target) */
    uniqueIndex("marks_student_paper_uq").on(t.studentId, t.examPaperId),
    index("marks_year_student_idx").on(t.academicYearId, t.studentId),
    index("marks_paper_idx").on(t.examPaperId),
    check("marks_obtained_chk", sql`${t.marksObtained} IS NULL OR ${t.marksObtained} >= 0`),
    check("marks_absence_reason_chk", sql`${t.absenceReason} IS NULL OR ${t.isAbsent}`)
  ]
);

export const marksRelations = relations(marks, ({ one }) => ({
  student: one(students, { fields: [marks.studentId], references: [students.id] }),
  examPaper: one(examPapers, { fields: [marks.examPaperId], references: [examPapers.id] }),
  evaluator: one(teachers, { fields: [marks.evaluatedBy], references: [teachers.id] })
}));
