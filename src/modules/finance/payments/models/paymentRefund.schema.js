import { relations, sql } from "drizzle-orm";
import { boolean, check, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { invoices } from "../../invoices/models/invoice.schema.js";
import { REFUND_METHODS, REFUND_SOURCES, REFUND_STATUSES } from "../../shared/constants/finance.constants.js";
import { money } from "../../shared/models/money.columns.js";
import { payments } from "./payment.schema.js";

export const refundMethod = pgEnum("refund_method", REFUND_METHODS);
export const refundStatus = pgEnum("refund_status", REFUND_STATUSES);
export const refundSource = pgEnum("refund_source", REFUND_SOURCES);

/* Money paid back from a payment, or from a student's credit (no payment: the family asked
   for its advance back). A staff refund starts as a request (REQUESTED, the maker) that an
   administrator approves (the checker); the approval executes it. An administrator's own
   refund is approved at once, by them. An accountant's refund within the school's approval
   limit is approved at once too (auto_approved). Gateway-dashboard refunds already happened, so
   they skip approval. The refund number is given when it is executed, so rejected requests
   leave no gaps.
   The amount is taken from the payment's leftover credit first (an overpayment kept for the
   student), then from what the payment put on its invoice. Until approval, from_credit and
   from_invoice are the planned split; the approval recomputes them. A refund reported by the
   gateway that the books cannot cover (the credit was already spent elsewhere) keeps the
   rest as `unallocated` for the accountant.
   A FAILED refund has been reversed: its money is back on the invoice and credit. */
export const paymentRefunds = pgTable(
  "payment_refunds",
  {
    ...baseColumns(),
    /* Both empty for a refund of the student's credit */
    paymentId: uuid("payment_id").references(() => payments.id),
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    /* Given on execution; empty while requested, and for rejected requests */
    refundNumber: text("refund_number"),
    amount: money("amount").notNull(),
    fromInvoice: money("from_invoice").notNull().default(0),
    fromCredit: money("from_credit").notNull().default(0),
    unallocated: money("unallocated").notNull().default(0),
    method: refundMethod("method").notNull(),
    status: refundStatus("status").notNull(),
    source: refundSource("source").notNull(),
    reason: text("reason"),
    reference: text("reference"),
    gatewayProvider: text("gateway_provider"),
    gatewayRefundId: text("gateway_refund_id"),
    requestedBy: uuid("requested_by").references(() => users.id),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /* Approved by the school's approval limit, not by a second person */
    autoApproved: boolean("auto_approved").notNull().default(false),
    rejectedBy: uuid("rejected_by").references(() => users.id),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true })
  },
  t => [
    uniqueIndex("payment_refunds_tenant_number_uq").on(t.tenantId, t.refundNumber),
    /* A gateway refund is recorded once, however many webhooks report it */
    uniqueIndex("payment_refunds_gateway_uq").on(t.tenantId, t.gatewayProvider, t.gatewayRefundId),
    index("payment_refunds_payment_idx").on(t.paymentId),
    index("payment_refunds_student_idx").on(t.tenantId, t.studentId, t.createdAt),
    index("payment_refunds_status_idx").on(t.tenantId, t.status, t.createdAt),
    check(
      "payment_refunds_amount_chk",
      sql`${t.amount} > 0 AND ${t.fromInvoice} >= 0 AND ${t.fromCredit} >= 0 AND ${t.unallocated} >= 0
        AND ${t.amount} = ${t.fromInvoice} + ${t.fromCredit} + ${t.unallocated}`
    ),
    /* Statuses compared as text: new enum values cannot be used in the migration that adds them */
    check(
      "payment_refunds_gateway_chk",
      sql`${t.method} <> 'ORIGINAL' OR ${t.status}::text IN ('REQUESTED', 'REJECTED') OR ${t.gatewayRefundId} IS NOT NULL`
    ),
    /* Maker-checker: money moves only on a recorded approval (gateway refunds aside) */
    check(
      "payment_refunds_approval_chk",
      sql`${t.source} <> 'STAFF' OR ${t.status}::text IN ('REQUESTED', 'REJECTED') OR (${t.approvedBy} IS NOT NULL AND ${t.approvedAt} IS NOT NULL)`
    ),
    check("payment_refunds_auto_chk", sql`NOT ${t.autoApproved} OR ${t.source} = 'STAFF'`),
    check(
      "payment_refunds_number_chk",
      sql`(${t.refundNumber} IS NULL) = (${t.status}::text IN ('REQUESTED', 'REJECTED'))`
    ),
    /* A credit refund: no payment, no invoice, nothing off an invoice, paid back by hand */
    check(
      "payment_refunds_credit_chk",
      sql`(${t.paymentId} IS NULL) = (${t.invoiceId} IS NULL) AND (${t.paymentId} IS NOT NULL OR (${t.source} = 'STAFF' AND ${t.method} <> 'ORIGINAL' AND ${t.fromInvoice} = 0))`
    ),
    check(
      "payment_refunds_rejection_chk",
      sql`(${t.status}::text = 'REJECTED') = (${t.rejectedAt} IS NOT NULL) AND (${t.rejectedAt} IS NULL OR (${t.rejectedBy} IS NOT NULL AND ${t.rejectionReason} IS NOT NULL))`
    )
  ]
);

export const paymentRefundsRelations = relations(paymentRefunds, ({ one }) => ({
  payment: one(payments, { fields: [paymentRefunds.paymentId], references: [payments.id] }),
  invoice: one(invoices, { fields: [paymentRefunds.invoiceId], references: [invoices.id] }),
  student: one(students, { fields: [paymentRefunds.studentId], references: [students.id] }),
  requester: one(users, { fields: [paymentRefunds.requestedBy], references: [users.id] }),
  approver: one(users, { fields: [paymentRefunds.approvedBy], references: [users.id] }),
  rejecter: one(users, { fields: [paymentRefunds.rejectedBy], references: [users.id] })
}));
