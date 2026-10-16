import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { libraryCopies } from "../../copies/models/copy.schema.js";
import { libraryHolds } from "../../holds/models/hold.schema.js";
import { libraryLoans } from "../../loans/models/loan.schema.js";
import { normalizeIsbn } from "../../shared/utils/isbn.util.js";
import { libraryBooks } from "../models/book.schema.js";

/* User text inside a LIKE pattern matches literally */
const likePattern = text => `%${text.replace(/[\\%_]/g, char => `\\${char}`)}%`;

export const bookRepository = {
  ...createRepository({ table: libraryBooks, queryKey: "libraryBooks", orderBy: asc(libraryBooks.title) }),

  /* Lock a book for the rest of the transaction. Every change to a book's copies
     or holds takes this lock first (book, then copy), so hold allocation is serial. */
  lockForUpdate: async (tenantId, bookId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(libraryBooks)
      .where(scoped(libraryBooks, tenantId, eq(libraryBooks.id, bookId)))
      .for("update");
    return row ?? null;
  },

  /* ?q= matches title, any author or the ISBN (with or without hyphens) */
  searchCondition: q => {
    const pattern = likePattern(q);
    return or(
      ilike(libraryBooks.title, pattern),
      sql`array_to_string(${libraryBooks.authors}, ' ') ILIKE ${pattern}`,
      ilike(libraryBooks.isbn, likePattern(normalizeIsbn(q)))
    );
  },

  /* Books with at least one copy on the shelf */
  availableCondition: tenantId =>
    inArray(
      libraryBooks.id,
      db
        .select({ bookId: libraryCopies.bookId })
        .from(libraryCopies)
        .where(scoped(libraryCopies, tenantId, eq(libraryCopies.status, "AVAILABLE")))
    ),

  /* -> [{ bookId, status, copies }] for the given books */
  countCopiesByStatus: (tenantId, bookIds, { dbc = db } = {}) =>
    bookIds.length
      ? dbc
          .select({ bookId: libraryCopies.bookId, status: libraryCopies.status, copies: count() })
          .from(libraryCopies)
          .where(and(scoped(libraryCopies, tenantId), inArray(libraryCopies.bookId, bookIds)))
          .groupBy(libraryCopies.bookId, libraryCopies.status)
      : [],

  /* -> [{ bookId, waiting }]: the hold queue of each book */
  countWaitingHolds: (tenantId, bookIds) =>
    bookIds.length
      ? db
          .select({ bookId: libraryHolds.bookId, waiting: count() })
          .from(libraryHolds)
          .where(
            scoped(libraryHolds, tenantId, inArray(libraryHolds.bookId, bookIds), eq(libraryHolds.status, "WAITING"))
          )
          .groupBy(libraryHolds.bookId)
      : [],

  /* Open holds on a book (inside the caller's transaction) */
  countOpenHolds: (tenantId, bookId, { dbc }) =>
    dbc.$count(
      libraryHolds,
      scoped(
        libraryHolds,
        tenantId,
        eq(libraryHolds.bookId, bookId),
        inArray(libraryHolds.status, ["WAITING", "READY"])
      )
    ),

  /* The public view of a book's copies: shelf status and, when out, the due date */
  circulatingCopies: (tenantId, bookId) =>
    db
      .select({
        accessionNumber: libraryCopies.accessionNumber,
        status: libraryCopies.status,
        itemType: libraryCopies.itemType,
        dueDate: libraryLoans.dueDate
      })
      .from(libraryCopies)
      .leftJoin(
        libraryLoans,
        and(
          eq(libraryLoans.copyId, libraryCopies.id),
          eq(libraryLoans.status, "ISSUED"),
          eq(libraryLoans.isActive, true)
        )
      )
      .where(
        scoped(
          libraryCopies,
          tenantId,
          eq(libraryCopies.bookId, bookId),
          inArray(libraryCopies.status, ["AVAILABLE", "ISSUED", "ON_HOLD"])
        )
      )
      .orderBy(asc(libraryCopies.accessionNumber))
};
