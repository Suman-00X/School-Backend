import { relations, sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { invoices } from "../../invoices/models/invoice.schema.js";
import { PAYMENT_METHODS, PAYMENT_STATUSES } from "../../shared/constants/finance.constants.js";
import { money } from "../../shared/models/money.columns.js";

export const paymentMethod = pgEnum("payment_method", PAYMENT_METHODS);
export const paymentStatus = pgEnum("payment_status", PAYMENT_STATUSES);

/* Money received against an invoice. Online payments start PENDING with a
   gateway order and become SUCCEEDED when the gateway confirms them.
   amount is what was received; excess_amount of it was more than the invoice's
   balance at that moment and went to the student's credit (D-21). */
export const payments = pgTable(
  "payments",
  {
    ...baseColumns(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    amount: money("amount").notNull(),
    excessAmount: money("excess_amount").notNull().default(0),
    /* The invoice's balance right after this payment (printed on the receipt) */
    balanceAfter: money("balance_after"),
    method: paymentMethod("method").notNull(),
    status: paymentStatus("status").notNull().default("PENDING"),
    receiptNumber: text("receipt_number"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /* Cheque number, UPI/bank reference… */
    reference: text("reference"),
    gatewayProvider: text("gateway_provider"),
    gatewayOrderId: text("gateway_order_id"),
    gatewayPaymentId: text("gateway_payment_id"),
    receivedBy: uuid("received_by").references(() => users.id),
    notes: text("notes")
  },
  t => [
    uniqueIndex("payments_tenant_receipt_uq").on(t.tenantId, t.receiptNumber),
    uniqueIndex("payments_gateway_order_uq").on(t.tenantId, t.gatewayProvider, t.gatewayOrderId),
    uniqueIndex("payments_gateway_payment_uq").on(t.tenantId, t.gatewayProvider, t.gatewayPaymentId),
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_paid_at_idx").on(t.tenantId, t.status, t.paidAt),
    check("payments_amount_chk", sql`${t.amount} > 0 AND ${t.excessAmount} >= 0 AND ${t.excessAmount} <= ${t.amount}`)
  ]
);

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
  student: one(students, { fields: [payments.studentId], references: [students.id] })
}));
