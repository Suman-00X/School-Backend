import { relations, sql } from "drizzle-orm";
import { check, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { userRole, users } from "../../../users/accounts/models/user.schema.js";
import { libraryBooks, libraryItemType } from "../../books/models/book.schema.js";
import { libraryCopies } from "../../copies/models/copy.schema.js";
import { libraryCirculationRules } from "../../circulation-rules/models/circulationRule.schema.js";
import { FINE_PAYMENT_METHODS, LOAN_STATUSES, RETURN_CONDITIONS } from "../../shared/constants/library.constants.js";
import { money } from "../../shared/models/money.columns.js";

export const libraryLoanStatus = pgEnum("library_loan_status", LOAN_STATUSES);
export const libraryReturnCondition = pgEnum("library_return_condition", RETURN_CONDITIONS);
export const libraryFinePaymentMethod = pgEnum("library_fine_payment_method", FINE_PAYMENT_METHODS);

/* One copy lent to one borrower, on the terms of the circulation rule that
   applied at issue (copied here, so later rule changes do not rewrite old loans).
   The late fine accrues daily while the book is out (materialised by payments,
   waivers, the nightly job and the return); fine_outstanding is computed. */
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
    /* Borrower category and item type at the time of issue */
    borrowerRole: userRole("borrower_role").notNull(),
    itemType: libraryItemType("item_type").notNull(),
    ruleId: uuid("rule_id").references(() => libraryCirculationRules.id),
    loanDays: integer("loan_days").notNull(),
    maxRenewals: integer("max_renewals").notNull(),
    finePerDay: money("fine_per_day").notNull(),
    fineGraceDays: integer("fine_grace_days").notNull(),
    /* Most one late fine can reach (the copy's price or the rule's maximum); null: no cap */
    fineCap: money("fine_cap"),
    issuedOn: date("issued_on").notNull(),
    dueDate: date("due_date").notNull(),
    returnedOn: date("returned_on"),
    lostOn: date("lost_on"),
    /* A lost copy that came back */
    foundOn: date("found_on"),
    status: libraryLoanStatus("status").notNull().default("ISSUED"),
    returnCondition: libraryReturnCondition("return_condition"),
    returnNotes: text("return_notes"),
    renewalCount: integer("renewal_count").notNull().default(0),
    lateFine: money("late_fine").notNull().default(0),
    lostCharge: money("lost_charge").notNull().default(0),
    damageCharge: money("damage_charge").notNull().default(0),
    /* Replacement charge taken back when a lost copy was found in time */
    lostChargeReversed: money("lost_charge_reversed").notNull().default(0),
    finePaid: money("fine_paid").notNull().default(0),
    fineWaived: money("fine_waived").notNull().default(0),
    /* Part of fine_paid moved to the borrower's library credit after a charge fell */
    fineCredited: money("fine_credited").notNull().default(0),
    fineOutstanding: money("fine_outstanding").generatedAlwaysAs(
      sql`late_fine + lost_charge + damage_charge - fine_paid - fine_waived + fine_credited`
    ),
    /* Why a loan was recorded with a past issue date */
    backdateReason: text("backdate_reason"),
    /* Why a blocked borrower was allowed to borrow */
    blockOverrideReason: text("block_override_reason"),
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
    index("library_loans_copy_idx").on(t.copyId),
    check("library_loans_open_chk", sql`(${t.status} = 'ISSUED') = (${t.returnedOn} IS NULL)`),
    check(
      "library_loans_dates_chk",
      sql`${t.dueDate} >= ${t.issuedOn} AND (${t.returnedOn} IS NULL OR ${t.returnedOn} >= ${t.issuedOn})`
    ),
    check(
      "library_loans_lost_chk",
      sql`(${t.status} = 'LOST') <= (${t.lostOn} IS NOT NULL) AND (${t.lostOn} IS NULL OR ${t.status} <> 'ISSUED') AND (${t.foundOn} IS NULL OR (${t.lostOn} IS NOT NULL AND ${t.status} = 'RETURNED' AND ${t.foundOn} >= ${t.lostOn}))`
    ),
    check("library_loans_renewals_chk", sql`${t.renewalCount} >= 0 AND ${t.maxRenewals} >= 0 AND ${t.loanDays} > 0`),
    check(
      "library_loans_fine_chk",
      sql`${t.lateFine} >= 0 AND ${t.lostCharge} >= 0 AND ${t.damageCharge} >= 0 AND ${t.lostChargeReversed} >= 0 AND ${t.finePaid} >= 0 AND ${t.fineWaived} >= 0 AND ${t.fineCredited} >= 0 AND ${t.fineCredited} <= ${t.finePaid} AND ${t.finePaid} - ${t.fineCredited} + ${t.fineWaived} <= ${t.lateFine} + ${t.lostCharge} + ${t.damageCharge}`
    ),
    check(
      "library_loans_terms_chk",
      sql`${t.finePerDay} >= 0 AND ${t.fineGraceDays} >= 0 AND (${t.fineCap} IS NULL OR ${t.fineCap} >= 0)`
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
    index("library_fine_payments_paid_idx").on(t.tenantId, t.paidAt),
    check("library_fine_payments_amount_chk", sql`${t.amount} > 0`)
  ]
);

/* Part or all of a fine forgiven, with the reason (several per loan) */
export const libraryFineWaivers = pgTable(
  "library_fine_waivers",
  {
    ...baseColumns(),
    loanId: uuid("loan_id")
      .notNull()
      .references(() => libraryLoans.id),
    amount: money("amount").notNull(),
    reason: text("reason").notNull(),
    waivedBy: uuid("waived_by").references(() => users.id),
    waivedAt: timestamp("waived_at", { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    index("library_fine_waivers_loan_idx").on(t.loanId),
    check("library_fine_waivers_amount_chk", sql`${t.amount} > 0`)
  ]
);

/* A borrower's library credit, as a ledger: + when a charge fell after it was
   paid (a lost copy found), - when credit pays a fine. Balance = sum(amount) >= 0. */
export const libraryCreditEntries = pgTable(
  "library_credit_entries",
  {
    ...baseColumns(),
    borrowerUserId: uuid("borrower_user_id")
      .notNull()
      .references(() => users.id),
    amount: money("amount").notNull(),
    reason: text("reason").notNull(),
    loanId: uuid("loan_id").references(() => libraryLoans.id),
    paymentId: uuid("payment_id").references(() => libraryFinePayments.id),
    createdBy: uuid("created_by").references(() => users.id)
  },
  t => [
    index("library_credit_entries_borrower_idx").on(t.tenantId, t.borrowerUserId),
    check("library_credit_entries_amount_chk", sql`${t.amount} <> 0`)
  ]
);

export const libraryLoansRelations = relations(libraryLoans, ({ one, many }) => ({
  copy: one(libraryCopies, { fields: [libraryLoans.copyId], references: [libraryCopies.id] }),
  book: one(libraryBooks, { fields: [libraryLoans.bookId], references: [libraryBooks.id] }),
  borrower: one(users, { fields: [libraryLoans.borrowerUserId], references: [users.id] }),
  payments: many(libraryFinePayments),
  waivers: many(libraryFineWaivers)
}));

export const libraryFinePaymentsRelations = relations(libraryFinePayments, ({ one }) => ({
  loan: one(libraryLoans, { fields: [libraryFinePayments.loanId], references: [libraryLoans.id] })
}));

export const libraryFineWaiversRelations = relations(libraryFineWaivers, ({ one }) => ({
  loan: one(libraryLoans, { fields: [libraryFineWaivers.loanId], references: [libraryLoans.id] })
}));
