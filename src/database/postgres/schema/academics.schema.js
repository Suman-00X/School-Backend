import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { isActive, primaryId, timestamps } from "./columns.js";
import { admissionType, enrollmentStatus, subjectType } from "./enums.js";
import { students, teachers } from "./people.schema.js";
import { tenantId } from "./tenancy.schema.js";

const active = t => sql`${t.isActive} = true`;

export const academicYears = pgTable(
  "academic_years",
  {
    id: primaryId(),
    tenantId: tenantId(),
    yearName: text("year_name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    description: text("description"),
    isActive: isActive(),
    ...timestamps()
  },
  t => [
    uniqueIndex("academic_years_tenant_name_uq").on(t.tenantId, t.yearName),
    /* At most one current year per tenant */
    uniqueIndex("academic_years_one_current_uq")
      .on(t.tenantId)
      .where(sql`${t.isCurrent} = true`),
    check("academic_years_dates_chk", sql`${t.endDate} > ${t.startDate}`)
  ]
);

/* Grade levels (Class 1, Class 2...), shared across years */
export const classes = pgTable(
  "classes",
  {
    id: primaryId(),
    tenantId: tenantId(),
    className: text("class_name").notNull(),
    classOrder: integer("class_order").notNull(),
    description: text("description"),
    isActive: isActive(),
    ...timestamps()
  },
  t => [
    uniqueIndex("classes_tenant_name_uq").on(t.tenantId, t.className),
    uniqueIndex("classes_tenant_order_uq").on(t.tenantId, t.classOrder)
  ]
);

/* A class's division within one academic year (Class 1 - A, 2026-27) */
export const sections = pgTable(
  "sections",
  {
    id: primaryId(),
    tenantId: tenantId(),
    academicYearId: uuid("academic_year_id").notNull().references(() => academicYears.id),
    classId: uuid("class_id").notNull().references(() => classes.id),
    sectionName: text("section_name").notNull(),
    capacity: integer("capacity"),
    classTeacherId: uuid("class_teacher_id").references(() => teachers.id),
    description: text("description"),
    isActive: isActive(),
    ...timestamps()
  },
  t => [
    uniqueIndex("sections_year_class_name_uq").on(t.academicYearId, t.classId, t.sectionName),
    index("sections_class_teacher_idx").on(t.classTeacherId, t.academicYearId),
    check("sections_capacity_chk", sql`${t.capacity} IS NULL OR ${t.capacity} > 0`)
  ]
);

export const subjects = pgTable(
  "subjects",
  {
    id: primaryId(),
    tenantId: tenantId(),
    subjectName: text("subject_name").notNull(),
    subjectCode: text("subject_code").notNull(),
    subjectType: subjectType("subject_type"),
    isOptional: boolean("is_optional").notNull().default(false),
    description: text("description"),
    isActive: isActive(),
    ...timestamps()
  },
  t => [
    uniqueIndex("subjects_tenant_code_uq").on(t.tenantId, t.subjectCode),
    uniqueIndex("subjects_tenant_name_uq").on(t.tenantId, t.subjectName)
  ]
);

/* Subjects taught in a section (API: class-section-subject-map) */
export const sectionSubjects = pgTable(
  "section_subjects",
  {
    id: primaryId(),
    tenantId: tenantId(),
    academicYearId: uuid("academic_year_id").notNull().references(() => academicYears.id),
    sectionId: uuid("section_id").notNull().references(() => sections.id),
    subjectId: uuid("subject_id").notNull().references(() => subjects.id),
    displayCode: text("display_code").notNull(),
    weeklyNoOfClasses: integer("weekly_no_of_classes"),
    description: text("description"),
    isActive: isActive(),
    ...timestamps()
  },
  t => [
    uniqueIndex("section_subjects_active_uq").on(t.sectionId, t.subjectId).where(active(t)),
    uniqueIndex("section_subjects_display_code_uq").on(t.sectionId, t.displayCode).where(active(t)),
    index("section_subjects_subject_idx").on(t.subjectId, t.academicYearId)
  ]
);

/* Who teaches a subject in a section (API: teacher-section-subject-map) */
export const teacherAssignments = pgTable(
  "teacher_assignments",
  {
    id: primaryId(),
    tenantId: tenantId(),
    academicYearId: uuid("academic_year_id").notNull().references(() => academicYears.id),
    teacherId: uuid("teacher_id").notNull().references(() => teachers.id),
    sectionId: uuid("section_id").notNull().references(() => sections.id),
    subjectId: uuid("subject_id").notNull().references(() => subjects.id),
    description: text("description"),
    isActive: isActive(),
    ...timestamps()
  },
  t => [
    /* One teacher per subject per section */
    uniqueIndex("teacher_assignments_active_uq").on(t.sectionId, t.subjectId).where(active(t)),
    index("teacher_assignments_teacher_idx").on(t.teacherId, t.academicYearId)
  ]
);

/* A student's place in a section for one academic year (API: student-section-map) */
export const studentEnrollments = pgTable(
  "student_enrollments",
  {
    id: primaryId(),
    tenantId: tenantId(),
    academicYearId: uuid("academic_year_id").notNull().references(() => academicYears.id),
    studentId: uuid("student_id").notNull().references(() => students.id),
    sectionId: uuid("section_id").notNull().references(() => sections.id),
    rollNumber: text("roll_number").notNull(),
    admissionType: admissionType("admission_type"),
    status: enrollmentStatus("status").notNull().default("ACTIVE"),
    description: text("description"),
    isActive: isActive(),
    ...timestamps()
  },
  t => [
    /* One enrollment per student per year */
    uniqueIndex("student_enrollments_year_student_uq").on(t.academicYearId, t.studentId),
    uniqueIndex("student_enrollments_section_roll_uq").on(t.sectionId, t.rollNumber),
    index("student_enrollments_student_idx").on(t.studentId)
  ]
);
