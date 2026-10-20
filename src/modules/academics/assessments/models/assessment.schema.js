import { relations, sql } from "drizzle-orm";
import { boolean, check, date, index, numeric, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { assessmentSchemeBuckets } from "../../assessment-schemes/models/assessmentScheme.schema.js";
import { homeworkAssignments } from "../../homework/models/homework.schema.js";
import { sections } from "../../sections/models/section.schema.js";
import { subjects } from "../../subjects/models/subject.schema.js";
import { ASSESSMENT_MARK_STATUSES, ASSESSMENT_TYPES } from "../../shared/constants/academic.constants.js";

const score = name => numeric(name, { precision: 6, scale: 2, mode: "number" });

export const assessmentType = pgEnum("assessment_type", ASSESSMENT_TYPES);
export const assessmentMarkStatus = pgEnum("assessment_mark_status", ASSESSMENT_MARK_STATUSES);

/* A teacher's own marked work for a section in a subject (class test, assignment, project,
   homework), counted in a scheme bucket. Homework that counts has one item (homeworkId):
   its marks are the graded submissions. */
export const assessments = pgTable(
  "assessments",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    bucketId: uuid("bucket_id")
      .notNull()
      .references(() => assessmentSchemeBuckets.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    assessmentType: assessmentType("assessment_type").notNull(),
    title: text("title").notNull(),
    assessedOn: date("assessed_on"),
    maxMarks: score("max_marks").notNull(),
    /* Off: kept (a practice test) but left out of the bucket */
    counts: boolean("counts").notNull().default(true),
    homeworkId: uuid("homework_id").references(() => homeworkAssignments.id),
    description: text("description"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id)
  },
  t => [
    index("assessments_bucket_section_subject_idx").on(t.bucketId, t.sectionId, t.subjectId),
    uniqueIndex("assessments_homework_uq").on(t.homeworkId).where(sql`${t.homeworkId} IS NOT NULL AND ${t.isActive} = true`),
    check("assessments_max_marks_chk", sql`${t.maxMarks} > 0`)
  ]
);

/* A student's entry for an item. For a homework item only the status is kept here
   (EXEMPT, MEDICAL, ABSENT); its marks come from the graded submission. */
export const assessmentMarks = pgTable(
  "assessment_marks",
  {
    ...baseColumns(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    status: assessmentMarkStatus("status").notNull().default("MARKED"),
    marksObtained: score("marks_obtained"),
    remarks: text("remarks"),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id)
  },
  t => [
    /* One row per student and item; clearing an entry deactivates it (upserts reactivate) */
    uniqueIndex("assessment_marks_item_student_uq").on(t.assessmentId, t.studentId),
    check(
      "assessment_marks_marks_chk",
      sql`${t.marksObtained} IS NULL OR ${t.marksObtained} >= 0`
    )
  ]
);

export const assessmentsRelations = relations(assessments, ({ one }) => ({
  bucket: one(assessmentSchemeBuckets, { fields: [assessments.bucketId], references: [assessmentSchemeBuckets.id] }),
  section: one(sections, { fields: [assessments.sectionId], references: [sections.id] }),
  subject: one(subjects, { fields: [assessments.subjectId], references: [subjects.id] })
}));
