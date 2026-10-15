import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { libraryCopies } from "../../copies/models/copy.schema.js";
import { normalizeIsbn } from "../../shared/utils/isbn.util.js";
import { libraryBooks } from "../models/book.schema.js";

/* User text inside a LIKE pattern matches literally */
const likePattern = text => `%${text.replace(/[\\%_]/g, char => `\\${char}`)}%`;

export const bookRepository = {
  ...createRepository({ table: libraryBooks, queryKey: "libraryBooks", orderBy: asc(libraryBooks.title) }),

  /* Lock a book for the rest of the transaction (adding copies vs removing the book) */
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
      : []
};
