import { and, desc, eq, lt, sql } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { libraryBooks } from "../../books/models/book.schema.js";
import { libraryCopies } from "../../copies/models/copy.schema.js";
import { libraryFinePayments, libraryLoans } from "../models/loan.schema.js";

const open = eq(libraryLoans.status, "ISSUED");

export const loanRepository = {
  ...createRepository({
    table: libraryLoans,
    queryKey: "libraryLoans",
    orderBy: [desc(libraryLoans.issuedOn), desc(libraryLoans.createdAt)]
  }),

  /* Lock a loan for the rest of the transaction (return, renewal, fines) */
  lockForUpdate: async (tenantId, loanId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(libraryLoans)
      .where(scoped(libraryLoans, tenantId, eq(libraryLoans.id, loanId)))
      .for("update");
    return row ?? null;
  },

  /* Serializes issues to one borrower until the transaction ends, so two
     concurrent issues cannot both slip under the active-loan limit */
  lockBorrower: (tenantId, userId, { dbc }) =>
    dbc.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`library-borrower:${tenantId}:${userId}`}, 0))`),

  countOpenForBorrower: (tenantId, userId, { dbc = db } = {}) =>
    dbc.$count(libraryLoans, scoped(libraryLoans, tenantId, open, eq(libraryLoans.borrowerUserId, userId))),

  hasOpenLoanOfBook: async (tenantId, userId, bookId, { dbc = db } = {}) =>
    (await dbc.$count(
      libraryLoans,
      scoped(libraryLoans, tenantId, open, eq(libraryLoans.borrowerUserId, userId), eq(libraryLoans.bookId, bookId))
    )) > 0,

  /* All tenants: open loans that may be overdue in some time zone (a wide window
     around the database's date); callers compare with each school's own today */
  findPossiblyOverdue: () =>
    db
      .select({ loan: libraryLoans, title: libraryBooks.title, accessionNumber: libraryCopies.accessionNumber })
      .from(libraryLoans)
      .innerJoin(libraryBooks, eq(libraryBooks.id, libraryLoans.bookId))
      .innerJoin(libraryCopies, eq(libraryCopies.id, libraryLoans.copyId))
      .where(and(eq(libraryLoans.isActive, true), open, lt(libraryLoans.dueDate, sql`current_date + 2`)))
};

export const finePaymentRepository = createRepository({
  table: libraryFinePayments,
  queryKey: "libraryFinePayments",
  orderBy: desc(libraryFinePayments.paidAt)
});
