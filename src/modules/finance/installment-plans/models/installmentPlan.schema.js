import { relations, sql } from "drizzle-orm";
import { check, date, integer, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { academicYears } from "../../../academics/academic-years/models/academicYear.schema.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";

/* How a year's fee is spread over the year: "Annual" (1), "Quarterly" (4), "Monthly" (10)…
   A plan belongs to one academic year, because its due dates are real dates (D-17). */
export const installmentPlans = pgTable(
  "installment_plans",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    name: text("name").notNull(),
    description: text("description")
  },
  t => [
    uniqueIndex("installment_plans_year_name_uq")
      .on(t.tenantId, t.academicYearId, sql`lower(${t.name})`)
      .where(activeRows(t))
  ]
);

/* One due date of a plan: takes sharePercent of every fee item. Shares add up to 100;
   the last installment absorbs rounding. Replaced as a set until invoices use them. */
export const planInstallments = pgTable(
  "plan_installments",
  {
    ...baseColumns(),
    installmentPlanId: uuid("installment_plan_id")
      .notNull()
      .references(() => installmentPlans.id),
    sequence: integer("sequence").notNull(),
    name: text("name").notNull(),
    dueDate: date("due_date").notNull(),
    sharePercent: numeric("share_percent", { precision: 5, scale: 2, mode: "number" }).notNull()
  },
  t => [
    uniqueIndex("plan_installments_sequence_uq").on(t.installmentPlanId, t.sequence),
    uniqueIndex("plan_installments_name_uq").on(t.installmentPlanId, sql`lower(${t.name})`),
    check("plan_installments_share_chk", sql`${t.sharePercent} > 0 AND ${t.sharePercent} <= 100 AND ${t.sequence} >= 1`)
  ]
);

/* The plan a student pays by in a year. installment_plan_id null = each fee structure's
   default. One row per student and year, never soft-deleted: it is also the row that
   serialises billing, plan changes and concession changes for that student and year. */
export const studentInstallmentPlans = pgTable(
  "student_installment_plans",
  {
    ...baseColumns(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    installmentPlanId: uuid("installment_plan_id").references(() => installmentPlans.id),
    assignedBy: uuid("assigned_by").references(() => users.id)
  },
  t => [uniqueIndex("student_installment_plans_student_year_uq").on(t.tenantId, t.studentId, t.academicYearId)]
);

export const installmentPlansRelations = relations(installmentPlans, ({ many }) => ({
  installments: many(planInstallments)
}));

export const planInstallmentsRelations = relations(planInstallments, ({ one }) => ({
  plan: one(installmentPlans, { fields: [planInstallments.installmentPlanId], references: [installmentPlans.id] })
}));

export const studentInstallmentPlansRelations = relations(studentInstallmentPlans, ({ one }) => ({
  plan: one(installmentPlans, {
    fields: [studentInstallmentPlans.installmentPlanId],
    references: [installmentPlans.id]
  }),
  student: one(students, { fields: [studentInstallmentPlans.studentId], references: [students.id] })
}));
