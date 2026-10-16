import { relations, sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { academicYears } from "../../../academics/academic-years/models/academicYear.schema.js";
import { feeHeads } from "../../fee-heads/models/feeHead.schema.js";
import { feeStructures } from "../../fee-structures/models/feeStructure.schema.js";
import { installmentPlans, planInstallments } from "../../installment-plans/models/installmentPlan.schema.js";
import { concessions, studentConcessions } from "../../concessions/models/concession.schema.js";
import { INVOICE_STATUSES } from "../../shared/constants/finance.constants.js";
import { money } from "../../shared/models/money.columns.js";

export const invoiceStatus = pgEnum("invoice_status", INVOICE_STATUSES);

/* A bill for one student, one fee structure and one installment of the student's plan.
   total = subtotal - discount + late fee, and amount paid never exceeds it (an
   overpayment becomes student credit). balance is computed by the database. */
export const invoices = pgTable(
  "invoices",
  {
    ...baseColumns(),
    invoiceNumber: text("invoice_number").notNull(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    feeStructureId: uuid("fee_structure_id")
      .notNull()
      .references(() => feeStructures.id),
    installmentPlanId: uuid("installment_plan_id")
      .notNull()
      .references(() => installmentPlans.id),
    planInstallmentId: uuid("plan_installment_id")
      .notNull()
      .references(() => planInstallments.id),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date").notNull(),
    /* Gross of the lines */
    subtotal: money("subtotal").notNull(),
    /* Concessions on the lines */
    discount: money("discount").notNull().default(0),
    lateFee: money("late_fee").notNull().default(0),
    total: money("total").notNull(),
    amountPaid: money("amount_paid").notNull().default(0),
    balance: money("balance").generatedAlwaysAs(sql`total - amount_paid`),
    status: invoiceStatus("status").notNull().default("ISSUED"),
    notes: text("notes"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    /* Late-fee waiver: no late fee is charged once waived; the amount waived is kept */
    lateFeeWaivedAt: timestamp("late_fee_waived_at", { withTimezone: true }),
    lateFeeWaivedBy: uuid("late_fee_waived_by").references(() => users.id),
    lateFeeWaivedAmount: money("late_fee_waived_amount").notNull().default(0),
    lateFeeWaiverReason: text("late_fee_waiver_reason")
  },
  t => [
    uniqueIndex("invoices_tenant_number_uq").on(t.tenantId, t.invoiceNumber),
    /* One live invoice per student, structure and installment */
    uniqueIndex("invoices_student_installment_uq")
      .on(t.studentId, t.feeStructureId, t.planInstallmentId)
      .where(sql`${t.status} <> 'CANCELLED'`),
    index("invoices_student_idx").on(t.studentId, t.academicYearId),
    index("invoices_due_idx").on(t.tenantId, t.status, t.dueDate),
    check(
      "invoices_amounts_chk",
      sql`${t.subtotal} >= 0 AND ${t.discount} >= 0 AND ${t.discount} <= ${t.subtotal} AND ${t.lateFee} >= 0 AND ${t.amountPaid} >= 0 AND ${t.lateFeeWaivedAmount} >= 0`
    ),
    check("invoices_total_chk", sql`${t.total} = ${t.subtotal} - ${t.discount} + ${t.lateFee}`),
    check("invoices_paid_chk", sql`${t.amountPaid} <= ${t.total}`)
  ]
);

/* One fee head of an invoice: gross, concessions and net */
export const invoiceLines = pgTable(
  "invoice_lines",
  {
    ...baseColumns(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    feeHeadId: uuid("fee_head_id")
      .notNull()
      .references(() => feeHeads.id),
    description: text("description").notNull(),
    amount: money("amount").notNull(),
    discount: money("discount").notNull().default(0),
    netAmount: money("net_amount").notNull()
  },
  t => [
    index("invoice_lines_invoice_idx").on(t.invoiceId),
    check(
      "invoice_lines_amounts_chk",
      sql`${t.discount} >= 0 AND ${t.discount} <= ${t.amount} AND ${t.netAmount} = ${t.amount} - ${t.discount}`
    )
  ]
);

/* Which concession took how much off a line. The name is copied, so receipts keep
   showing what was applied even if the concession is renamed later. */
export const invoiceLineConcessions = pgTable(
  "invoice_line_concessions",
  {
    ...baseColumns(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    invoiceLineId: uuid("invoice_line_id")
      .notNull()
      .references(() => invoiceLines.id),
    concessionId: uuid("concession_id")
      .notNull()
      .references(() => concessions.id),
    studentConcessionId: uuid("student_concession_id").references(() => studentConcessions.id),
    name: text("name").notNull(),
    amount: money("amount").notNull()
  },
  t => [
    index("invoice_line_concessions_invoice_idx").on(t.invoiceId),
    check("invoice_line_concessions_amount_chk", sql`${t.amount} > 0`)
  ]
);

export const invoicesRelations = relations(invoices, ({ many, one }) => ({
  lines: many(invoiceLines),
  student: one(students, { fields: [invoices.studentId], references: [students.id] }),
  plan: one(installmentPlans, { fields: [invoices.installmentPlanId], references: [installmentPlans.id] }),
  installment: one(planInstallments, { fields: [invoices.planInstallmentId], references: [planInstallments.id] }),
  structure: one(feeStructures, { fields: [invoices.feeStructureId], references: [feeStructures.id] })
}));

export const invoiceLinesRelations = relations(invoiceLines, ({ many, one }) => ({
  invoice: one(invoices, { fields: [invoiceLines.invoiceId], references: [invoices.id] }),
  feeHead: one(feeHeads, { fields: [invoiceLines.feeHeadId], references: [feeHeads.id] }),
  concessions: many(invoiceLineConcessions)
}));

export const invoiceLineConcessionsRelations = relations(invoiceLineConcessions, ({ one }) => ({
  line: one(invoiceLines, { fields: [invoiceLineConcessions.invoiceLineId], references: [invoiceLines.id] }),
  concession: one(concessions, { fields: [invoiceLineConcessions.concessionId], references: [concessions.id] })
}));
