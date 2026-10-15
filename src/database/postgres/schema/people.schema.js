import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { isActive, primaryId, timestamps } from "./columns.js";
import { employmentType, gender, parentRelation, userRole, userStatus } from "./enums.js";
import { tenantId } from "./tenancy.schema.js";

/* Login identity + personal details, one per person */
export const users = pgTable(
  "users",
  {
    id: primaryId(),
    tenantId: tenantId(),
    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash"),
    role: userRole("role").notNull(),
    gender: gender("gender"),
    dob: date("dob"),
    address: text("address"),
    status: userStatus("status").notNull().default("ACTIVE"),
    isActive: isActive(),
    ...timestamps()
  },
  t => [
    uniqueIndex("users_tenant_email_uq").on(t.tenantId, t.email),
    index("users_tenant_role_idx").on(t.tenantId, t.role)
  ]
);

export const teachers = pgTable(
  "teachers",
  {
    id: primaryId(),
    tenantId: tenantId(),
    userId: uuid("user_id").notNull().unique().references(() => users.id),
    employeeCode: text("employee_code"),
    qualification: text("qualification"),
    experienceYears: integer("experience_years"),
    joiningDate: date("joining_date"),
    employmentType: employmentType("employment_type"),
    bloodGroup: text("blood_group"),
    description: text("description"),
    isActive: isActive(),
    ...timestamps()
  },
  t => [uniqueIndex("teachers_tenant_employee_code_uq").on(t.tenantId, t.employeeCode)]
);

export const students = pgTable(
  "students",
  {
    id: primaryId(),
    tenantId: tenantId(),
    userId: uuid("user_id").notNull().unique().references(() => users.id),
    studentCode: text("student_code").notNull(),
    admissionNumber: text("admission_number").notNull(),
    admissionDate: date("admission_date"),
    bloodGroup: text("blood_group"),
    category: text("category"),
    religion: text("religion"),
    description: text("description"),
    isActive: isActive(),
    ...timestamps()
  },
  t => [
    uniqueIndex("students_tenant_admission_number_uq").on(t.tenantId, t.admissionNumber),
    uniqueIndex("students_tenant_student_code_uq").on(t.tenantId, t.studentCode)
  ]
);

export const parents = pgTable(
  "parents",
  {
    id: primaryId(),
    tenantId: tenantId(),
    userId: uuid("user_id").notNull().unique().references(() => users.id),
    parentCode: text("parent_code").notNull(),
    occupation: text("occupation"),
    annualIncome: numeric("annual_income", { precision: 12, scale: 2 }),
    description: text("description"),
    isActive: isActive(),
    ...timestamps()
  },
  t => [uniqueIndex("parents_tenant_parent_code_uq").on(t.tenantId, t.parentCode)]
);

/* Student ↔ parent links (soft-deletable) */
export const studentParents = pgTable(
  "student_parents",
  {
    id: primaryId(),
    tenantId: tenantId(),
    studentId: uuid("student_id").notNull().references(() => students.id),
    parentId: uuid("parent_id").notNull().references(() => parents.id),
    relation: parentRelation("relation").notNull(),
    isPrimaryContact: boolean("is_primary_contact").notNull().default(false),
    isActive: isActive(),
    ...timestamps()
  },
  t => [
    uniqueIndex("student_parents_active_uq")
      .on(t.studentId, t.parentId)
      .where(sql`${t.isActive} = true`),
    index("student_parents_parent_idx").on(t.parentId)
  ]
);
