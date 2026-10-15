import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { students } from "../../../users/students/models/student.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { sections } from "../../sections/models/section.schema.js";
import { ADMISSION_TYPES, ENROLLMENT_STATUSES } from "../../shared/constants/academic.constants.js";

export const admissionType = pgEnum("admission_type", ADMISSION_TYPES);
export const enrollmentStatus = pgEnum("enrollment_status", ENROLLMENT_STATUSES);

/* A student's section and roll number for one academic year.
   Promotion adds the next year's row and marks this one LEFT. */
export const studentEnrollments = pgTable(
  "student_enrollments",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id").notNull().references(() => academicYears.id),
    studentId: uuid("student_id").notNull().references(() => students.id),
    sectionId: uuid("section_id").notNull().references(() => sections.id),
    rollNumber: text("roll_number").notNull(),
    admissionType: admissionType("admission_type"),
    status: enrollmentStatus("status").notNull().default("ACTIVE"),
    description: text("description")
  },
  t => [
    /* One enrollment per student per year */
    uniqueIndex("student_enrollments_year_student_uq").on(t.academicYearId, t.studentId),
    uniqueIndex("student_enrollments_section_roll_uq").on(t.sectionId, t.rollNumber),
    index("student_enrollments_student_idx").on(t.studentId)
  ]
);

export const studentEnrollmentsRelations = relations(studentEnrollments, ({ one }) => ({
  student: one(students, { fields: [studentEnrollments.studentId], references: [students.id] }),
  section: one(sections, { fields: [studentEnrollments.sectionId], references: [sections.id] })
}));
