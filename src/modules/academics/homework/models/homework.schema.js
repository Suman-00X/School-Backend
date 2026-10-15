import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { teachers } from "../../../users/teachers/models/teacher.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { sections } from "../../sections/models/section.schema.js";
import { subjects } from "../../subjects/models/subject.schema.js";

const score = name => numeric(name, { precision: 6, scale: 2, mode: "number" });

export const SUBMISSION_STATUSES = ["SUBMITTED", "GRADED", "RETURNED"];
export const submissionStatus = pgEnum("homework_submission_status", SUBMISSION_STATUSES);

/* Work set for a section in a subject. Attachments are stored files (owner HOMEWORK). */
export const homeworkAssignments = pgTable(
  "homework_assignments",
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
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => users.id),
    teacherId: uuid("teacher_id").references(() => teachers.id),
    title: text("title").notNull(),
    description: text("description"),
    assignedOn: date("assigned_on").notNull(),
    dueDate: date("due_date").notNull(),
    /* null = not graded with marks */
    maxMarks: score("max_marks"),
    allowLateSubmission: boolean("allow_late_submission").notNull().default(false)
  },
  t => [
    index("homework_section_due_idx").on(t.sectionId, t.dueDate),
    check("homework_dates_chk", sql`${t.dueDate} >= ${t.assignedOn}`),
    check("homework_max_marks_chk", sql`${t.maxMarks} IS NULL OR ${t.maxMarks} > 0`)
  ]
);

/* A student's answer. Attachments are stored files (owner SUBMISSION). */
export const homeworkSubmissions = pgTable(
  "homework_submissions",
  {
    ...baseColumns(),
    homeworkId: uuid("homework_id")
      .notNull()
      .references(() => homeworkAssignments.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    content: text("content"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    isLate: boolean("is_late").notNull().default(false),
    status: submissionStatus("status").notNull().default("SUBMITTED"),
    marksAwarded: score("marks_awarded"),
    feedback: text("feedback"),
    gradedBy: uuid("graded_by").references(() => users.id),
    gradedAt: timestamp("graded_at", { withTimezone: true })
  },
  t => [
    uniqueIndex("homework_submissions_active_uq").on(t.homeworkId, t.studentId).where(activeRows(t)),
    check("homework_submissions_marks_chk", sql`${t.marksAwarded} IS NULL OR ${t.marksAwarded} >= 0`)
  ]
);

export const homeworkAssignmentsRelations = relations(homeworkAssignments, ({ one }) => ({
  subject: one(subjects, { fields: [homeworkAssignments.subjectId], references: [subjects.id] }),
  section: one(sections, { fields: [homeworkAssignments.sectionId], references: [sections.id] })
}));

export const homeworkSubmissionsRelations = relations(homeworkSubmissions, ({ one }) => ({
  homework: one(homeworkAssignments, { fields: [homeworkSubmissions.homeworkId], references: [homeworkAssignments.id] })
}));
