import { relations, sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { invoices } from "../../invoices/models/invoice.schema.js";
import { payments } from "../../payments/models/payment.schema.js";
import { CREDIT_ENTRY_TYPES } from "../../shared/constants/finance.constants.js";
import { money } from "../../shared/models/money.columns.js";

export const creditEntryType = pgEnum("credit_entry_type", CREDIT_ENTRY_TYPES);

/* A student's unused credit (advance), across academic years. The CHECK makes it
   impossible to spend more credit than there is, even under concurrent requests. */
export const studentCreditBalances = pgTable(
  "student_credit_balances",
  {
    ...baseColumns(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    balance: money("balance").notNull().default(0)
  },
  t => [
    uniqueIndex("student_credit_balances_student_uq").on(t.tenantId, t.studentId),
    check("student_credit_balances_chk", sql`${t.balance} >= 0`)
  ]
);

/* Append-only history of the balance: overpayments in, applications to invoices and refunds out */
export const studentCreditEntries = pgTable(
  "student_credit_entries",
  {
    ...baseColumns(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    entryType: creditEntryType("entry_type").notNull(),
    amount: money("amount").notNull(),
    /* OVERPAYMENT: the payment it came from */
    paymentId: uuid("payment_id").references(() => payments.id),
    /* APPLIED: the invoice it paid */
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    /* REFUNDED: how it was paid back */
    method: text("method"),
    reference: text("reference"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id)
  },
  t => [
    index("student_credit_entries_student_idx").on(t.tenantId, t.studentId, t.createdAt),
    check(
      "student_credit_entries_chk",
      sql`${t.amount} > 0 AND (${t.entryType} <> 'OVERPAYMENT' OR ${t.paymentId} IS NOT NULL) AND (${t.entryType} <> 'APPLIED' OR ${t.invoiceId} IS NOT NULL)`
    )
  ]
);

export const studentCreditEntriesRelations = relations(studentCreditEntries, ({ one }) => ({
  invoice: one(invoices, { fields: [studentCreditEntries.invoiceId], references: [invoices.id] }),
  payment: one(payments, { fields: [studentCreditEntries.paymentId], references: [payments.id] })
}));
