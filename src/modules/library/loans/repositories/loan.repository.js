import { and, desc, eq, gt, lte, or, sql, sum } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { libraryBooks } from "../../books/models/book.schema.js";
import { libraryCopies } from "../../copies/models/copy.schema.js";
import { libraryCreditEntries, libraryFinePayments, libraryFineWaivers, libraryLoans } from "../models/loan.schema.js";

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

  /* Open loans of a borrower, optionally of one item type */
  countOpenForBorrower: (tenantId, userId, itemType, { dbc = db } = {}) =>
    dbc.$count(
      libraryLoans,
      scoped(
        libraryLoans,
        tenantId,
        open,
        eq(libraryLoans.borrowerUserId, userId),
        itemType ? eq(libraryLoans.itemType, itemType) : undefined
      )
    ),

  hasOpenLoanOfBook: async (tenantId, userId, bookId, { dbc = db } = {}) =>
    (await dbc.$count(
      libraryLoans,
      scoped(libraryLoans, tenantId, open, eq(libraryLoans.borrowerUserId, userId), eq(libraryLoans.bookId, bookId))
    )) > 0,

  /* What a borrower owes or still has out: open loans and closed loans with a fine left */
  findStanding: (tenantId, userId, { dbc = db } = {}) =>
    dbc.query.libraryLoans.findMany({
      where: scoped(
        libraryLoans,
        tenantId,
        eq(libraryLoans.borrowerUserId, userId),
        or(open, gt(libraryLoans.fineOutstanding, 0))
      ),
      with: { book: { columns: { id: true, title: true } }, copy: { columns: { id: true, accessionNumber: true } } },
      orderBy: [libraryLoans.dueDate]
    }),

  /* The last date a copy came back (a back-dated loan cannot start before it) */
  lastReturnOfCopy: async (tenantId, copyId, { dbc = db } = {}) => {
    const [row] = await dbc
      .select({ returnedOn: sql`max(${libraryLoans.returnedOn})::text` })
      .from(libraryLoans)
      .where(scoped(libraryLoans, tenantId, eq(libraryLoans.copyId, copyId)));
    return row?.returnedOn ?? null;
  },

  /* Nightly accrual without a row lock: only raises the fine, only while the loan is open
     (a return or payment in between has already recorded its own, final value) */
  raiseLateFine: (tenantId, loanId, lateFine) =>
    db
      .update(libraryLoans)
      .set({ lateFine: sql`greatest(${libraryLoans.lateFine}, ${lateFine})` })
      .where(scoped(libraryLoans, tenantId, eq(libraryLoans.id, loanId), open)),

  /* All tenants: open loans due within a month (reminders and fine accrual run on each
     school's own today, so the window is wide) */
  findOpenDueBefore: () =>
    db
      .select({ loan: libraryLoans, title: libraryBooks.title, accessionNumber: libraryCopies.accessionNumber })
      .from(libraryLoans)
      .innerJoin(libraryBooks, eq(libraryBooks.id, libraryLoans.bookId))
      .innerJoin(libraryCopies, eq(libraryCopies.id, libraryLoans.copyId))
      .where(and(eq(libraryLoans.isActive, true), open, lte(libraryLoans.dueDate, sql`current_date + 32`)))
};

export const finePaymentRepository = {
  ...createRepository({
    table: libraryFinePayments,
    queryKey: "libraryFinePayments",
    orderBy: desc(libraryFinePayments.paidAt)
  }),

  /* Every fine payment a borrower made, newest first, with the book */
  findForBorrower: (tenantId, userId) =>
    db
      .select({
        id: libraryFinePayments.id,
        loanId: libraryFinePayments.loanId,
        amount: libraryFinePayments.amount,
        method: libraryFinePayments.method,
        receiptNumber: libraryFinePayments.receiptNumber,
        paidAt: libraryFinePayments.paidAt,
        title: libraryBooks.title
      })
      .from(libraryFinePayments)
      .innerJoin(libraryLoans, eq(libraryLoans.id, libraryFinePayments.loanId))
      .innerJoin(libraryBooks, eq(libraryBooks.id, libraryLoans.bookId))
      .where(scoped(libraryFinePayments, tenantId, eq(libraryLoans.borrowerUserId, userId)))
      .orderBy(desc(libraryFinePayments.paidAt))
};

export const fineWaiverRepository = createRepository({
  table: libraryFineWaivers,
  queryKey: "libraryFineWaivers",
  orderBy: desc(libraryFineWaivers.waivedAt)
});

const credits = createRepository({
  table: libraryCreditEntries,
  queryKey: "libraryCreditEntries",
  orderBy: desc(libraryCreditEntries.createdAt)
});

export const creditRepository = {
  ...credits,

  balanceOf: async (tenantId, userId, { dbc = db } = {}) => {
    const [row] = await dbc
      .select({ balance: sum(libraryCreditEntries.amount).mapWith(Number) })
      .from(libraryCreditEntries)
      .where(scoped(libraryCreditEntries, tenantId, eq(libraryCreditEntries.borrowerUserId, userId)));
    return row?.balance ?? 0;
  }
};
