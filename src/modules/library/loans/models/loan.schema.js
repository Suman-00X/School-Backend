import { relations, sql } from "drizzle-orm";
import { check, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { userRole, users } from "../../../users/accounts/models/user.schema.js";
import { libraryBooks } from "../../books/models/book.schema.js";
import { libraryCopies } from "../../copies/models/copy.schema.js";
import { FINE_PAYMENT_METHODS, LOAN_STATUSES, RETURN_CONDITIONS } from "../../shared/constants/library.constants.js";
import { money } from "../../shared/models/money.columns.js";

export const libraryLoanStatus = pgEnum("library_loan_status", LOAN_STATUSES);
export const libraryReturnCondition = pgEnum("library_return_condition", RETURN_CONDITIONS);
export const libraryFinePaymentMethod = pgEnum("library_fine_payment_method", FINE_PAYMENT_METHODS);

/* One copy lent to one borrower. The fine is assessed on return (late days and,
   for a lost copy, its price); fine_outstanding is computed by the database. */
export const libraryLoans = pgTable(
  "library_loans",
  {
    ...baseColumns(),
    copyId: uuid("copy_id")
      .notNull()
      .references(() => libraryCopies.id),
    bookId: uuid("book_id")
      .notNull()
      .references(() => libraryBooks.id),
    borrowerUserId: uuid("borrower_user_id")
      .notNull()
      .references(() => users.id),
    /* Role at the time of issue (decides the loan period and limit) */
    borrowerRole: userRole("borrower_role").notNull(),
    issuedOn: date("issued_on").notNull(),
    dueDate: date("due_date").notNull(),
    returnedOn: date("returned_on"),
    status: libraryLoanStatus("status").notNull().default("ISSUED"),
    returnCondition: libraryReturnCondition("return_condition"),
    returnNotes: text("return_notes"),
    renewalCount: integer("renewal_count").notNull().default(0),
    lateFine: money("late_fine").notNull().default(0),
    lostCharge: money("lost_charge").notNull().default(0),
    finePaid: money("fine_paid").notNull().default(0),
    fineWaived: money("fine_waived").notNull().default(0),
    fineOutstanding: money("fine_outstanding").generatedAlwaysAs(
      sql`late_fine + lost_charge - fine_paid - fine_waived`
    ),
    waiverReason: text("waiver_reason"),
    waivedBy: uuid("waived_by").references(() => users.id),
    waivedAt: timestamp("waived_at", { withTimezone: true }),
    issuedBy: uuid("issued_by").references(() => users.id),
    returnedTo: uuid("returned_to").references(() => users.id)
  },
  t => [
    /* A copy is on at most one open loan (backstop for the row lock) */
    uniqueIndex("library_loans_open_copy_uq")
      .on(t.copyId)
      .where(sql`${t.status} = 'ISSUED' AND ${t.isActive} = true`),
    index("library_loans_borrower_idx").on(t.tenantId, t.borrowerUserId, t.status),
    index("library_loans_due_idx").on(t.tenantId, t.status, t.dueDate),
    index("library_loans_book_idx").on(t.bookId),
    check("library_loans_open_chk", sql`(${t.status} = 'ISSUED') = (${t.returnedOn} IS NULL)`),
    check("library_loans_dates_chk", sql`${t.returnedOn} IS NULL OR ${t.returnedOn} >= ${t.issuedOn}`),
    check("library_loans_renewals_chk", sql`${t.renewalCount} >= 0`),
    check(
      "library_loans_fine_chk",
      sql`${t.lateFine} >= 0 AND ${t.lostCharge} >= 0 AND ${t.finePaid} >= 0 AND ${t.fineWaived} >= 0 AND ${t.finePaid} + ${t.fineWaived} <= ${t.lateFine} + ${t.lostCharge}`
    )
  ]
);

/* Money received against a loan's fine, with a receipt number */
export const libraryFinePayments = pgTable(
  "library_fine_payments",
  {
    ...baseColumns(),
    loanId: uuid("loan_id")
      .notNull()
      .references(() => libraryLoans.id),
    amount: money("amount").notNull(),
    method: libraryFinePaymentMethod("method").notNull(),
    receiptNumber: text("receipt_number").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    /* UPI / card reference */
    reference: text("reference"),
    receivedBy: uuid("received_by").references(() => users.id)
  },
  t => [
    uniqueIndex("library_fine_payments_receipt_uq").on(t.tenantId, t.receiptNumber),
    index("library_fine_payments_loan_idx").on(t.loanId),
    check("library_fine_payments_amount_chk", sql`${t.amount} > 0`)
  ]
);

export const libraryLoansRelations = relations(libraryLoans, ({ one, many }) => ({
  copy: one(libraryCopies, { fields: [libraryLoans.copyId], references: [libraryCopies.id] }),
  book: one(libraryBooks, { fields: [libraryLoans.bookId], references: [libraryBooks.id] }),
  borrower: one(users, { fields: [libraryLoans.borrowerUserId], references: [users.id] }),
  payments: many(libraryFinePayments)
}));

export const libraryFinePaymentsRelations = relations(libraryFinePayments, ({ one }) => ({
  loan: one(libraryLoans, { fields: [libraryFinePayments.loanId], references: [libraryLoans.id] })
}));
