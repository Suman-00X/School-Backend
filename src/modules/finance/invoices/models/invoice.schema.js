import { relations, sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { students } from "../../../users/students/models/student.schema.js";
import { academicYears } from "../../../academics/academic-years/models/academicYear.schema.js";
import { feeHeads } from "../../fee-heads/models/feeHead.schema.js";
import { feeInstallments, feeStructures } from "../../fee-structures/models/feeStructure.schema.js";
import { INVOICE_STATUSES } from "../../shared/constants/finance.constants.js";
import { money } from "../../shared/models/money.columns.js";

export const invoiceStatus = pgEnum("invoice_status", INVOICE_STATUSES);

/* A bill for one student and one installment of a fee structure.
   balance is computed by the database, so it can never drift from total - amountPaid. */
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
    feeInstallmentId: uuid("fee_installment_id")
      .notNull()
      .references(() => feeInstallments.id),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date").notNull(),
    subtotal: money("subtotal").notNull(),
    discount: money("discount").notNull().default(0),
    lateFee: money("late_fee").notNull().default(0),
    total: money("total").notNull(),
    amountPaid: money("amount_paid").notNull().default(0),
    balance: money("balance").generatedAlwaysAs(sql`total - amount_paid`),
    status: invoiceStatus("status").notNull().default("ISSUED"),
    notes: text("notes"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason")
  },
  t => [
    uniqueIndex("invoices_tenant_number_uq").on(t.tenantId, t.invoiceNumber),
    /* One live invoice per student per installment */
    uniqueIndex("invoices_student_installment_uq")
      .on(t.studentId, t.feeInstallmentId)
      .where(sql`${t.status} <> 'CANCELLED'`),
    index("invoices_student_idx").on(t.studentId, t.academicYearId),
    index("invoices_due_idx").on(t.tenantId, t.status, t.dueDate),
    check(
      "invoices_amounts_chk",
      sql`${t.subtotal} >= 0 AND ${t.discount} >= 0 AND ${t.lateFee} >= 0 AND ${t.total} >= 0 AND ${t.amountPaid} >= 0`
    )
  ]
);

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
  t => [index("invoice_lines_invoice_idx").on(t.invoiceId)]
);

export const invoicesRelations = relations(invoices, ({ many, one }) => ({
  lines: many(invoiceLines),
  student: one(students, { fields: [invoices.studentId], references: [students.id] }),
  installment: one(feeInstallments, { fields: [invoices.feeInstallmentId], references: [feeInstallments.id] }),
  structure: one(feeStructures, { fields: [invoices.feeStructureId], references: [feeStructures.id] })
}));

export const invoiceLinesRelations = relations(invoiceLines, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLines.invoiceId], references: [invoices.id] }),
  feeHead: one(feeHeads, { fields: [invoiceLines.feeHeadId], references: [feeHeads.id] })
}));
