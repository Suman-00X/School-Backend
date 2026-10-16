import { relations, sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { libraryBooks } from "../../books/models/book.schema.js";
import { libraryCopies } from "../../copies/models/copy.schema.js";
import { libraryLoans } from "../../loans/models/loan.schema.js";
import { HOLD_STATUSES } from "../../shared/constants/library.constants.js";

export const libraryHoldStatus = pgEnum("library_hold_status", HOLD_STATUSES);

/* A reservation of a title. WAITING holds queue by requested_at; when a copy
   comes back it is held for the first one (READY, copy ON_HOLD) until pickup_by. */
export const libraryHolds = pgTable(
  "library_holds",
  {
    ...baseColumns(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => libraryBooks.id),
    borrowerUserId: uuid("borrower_user_id")
      .notNull()
      .references(() => users.id),
    status: libraryHoldStatus("status").notNull().default("WAITING"),
    /* Queue order */
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    /* The borrower no longer wants it after this date (null: until cancelled) */
    notNeededAfter: date("not_needed_after"),
    /* READY: the copy kept at the desk, and until when */
    copyId: uuid("copy_id").references(() => libraryCopies.id),
    readyOn: date("ready_on"),
    pickupBy: date("pickup_by"),
    fulfilledLoanId: uuid("fulfilled_loan_id").references(() => libraryLoans.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedReason: text("closed_reason"),
    placedBy: uuid("placed_by").references(() => users.id),
    closedBy: uuid("closed_by").references(() => users.id)
  },
  t => [
    /* One open hold per borrower per title */
    uniqueIndex("library_holds_open_borrower_uq")
      .on(t.tenantId, t.bookId, t.borrowerUserId)
      .where(sql`${t.status} IN ('WAITING', 'READY') AND ${t.isActive} = true`),
    /* A copy is held for at most one borrower */
    uniqueIndex("library_holds_ready_copy_uq")
      .on(t.copyId)
      .where(sql`${t.status} = 'READY' AND ${t.isActive} = true`),
    index("library_holds_queue_idx").on(t.tenantId, t.bookId, t.status, t.requestedAt),
    index("library_holds_borrower_idx").on(t.tenantId, t.borrowerUserId, t.status),
    check(
      "library_holds_ready_chk",
      sql`(${t.status} <> 'WAITING' OR (${t.copyId} IS NULL AND ${t.readyOn} IS NULL AND ${t.pickupBy} IS NULL)) AND (${t.status} <> 'READY' OR (${t.copyId} IS NOT NULL AND ${t.readyOn} IS NOT NULL AND ${t.pickupBy} IS NOT NULL))`
    ),
    check("library_holds_fulfilled_chk", sql`(${t.status} = 'FULFILLED') = (${t.fulfilledLoanId} IS NOT NULL)`),
    check("library_holds_pickup_chk", sql`${t.pickupBy} IS NULL OR ${t.pickupBy} >= ${t.readyOn}`)
  ]
);

export const libraryHoldsRelations = relations(libraryHolds, ({ one }) => ({
  book: one(libraryBooks, { fields: [libraryHolds.bookId], references: [libraryBooks.id] }),
  copy: one(libraryCopies, { fields: [libraryHolds.copyId], references: [libraryCopies.id] }),
  borrower: one(users, { fields: [libraryHolds.borrowerUserId], references: [users.id] })
}));
