import { index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { exams } from "../../exams/models/exam.schema.js";
import { sections } from "../../sections/models/section.schema.js";

/* One student's Holistic Progress Card for one exam (term), kept beside the marks.
   subjects: [{ subjectId, awareness, sensitivity, creativity, selfAssessment,
   peerAssessment, remark }], levels BEGINNER | PROFICIENT | ADVANCED or null. */
export const holisticProgressRecords = pgTable(
  "holistic_progress_records",
  {
    ...baseColumns(),
    /* The exam's year (archived years are read-only) */
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    /* The student's section when it was recorded */
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    subjects: jsonb("subjects").notNull().default([]),
    interests: text("interests"),
    strengths: text("strengths"),
    areasToImprove: text("areas_to_improve"),
    teacherRemark: text("teacher_remark"),
    parentFeedback: text("parent_feedback"),
    recordedBy: uuid("recorded_by").references(() => users.id)
  },
  t => [
    uniqueIndex("holistic_progress_exam_student_uq").on(t.examId, t.studentId).where(activeRows(t)),
    index("holistic_progress_section_idx").on(t.tenantId, t.sectionId, t.examId)
  ]
);
