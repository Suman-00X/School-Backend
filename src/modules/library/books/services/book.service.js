import { eq, ne } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { subjectService } from "../../../academics/subjects/index.js";
import { copyService } from "../../copies/index.js";
import { libraryBooks } from "../models/book.schema.js";
import { bookRepository } from "../repositories/book.repository.js";

const withSubject = { subject: { columns: { id: true, subjectName: true, subjectCode: true } } };

/* { total, available, issued, lost, damaged, withdrawn } per book id.
   `total` is the collection: every copy that has not been withdrawn. */
const copyCountsFor = async (ctx, bookIds) => {
  const counts = new Map(
    bookIds.map(id => [id, { total: 0, available: 0, issued: 0, lost: 0, damaged: 0, withdrawn: 0 }])
  );
  for (const { bookId, status, copies } of await bookRepository.countCopiesByStatus(ctx.tenantId, bookIds)) {
    const entry = counts.get(bookId);
    entry[status.toLowerCase()] = copies;
    if (status !== "WITHDRAWN") entry.total += copies;
  }
  return counts;
};

const withCopyCounts = async (ctx, books) => {
  const counts = await copyCountsFor(
    ctx,
    books.map(book => book.id)
  );
  return books.map(book => ({ ...book, copies: counts.get(book.id) }));
};

const checkSubject = async (ctx, subjectId) => {
  if (subjectId && !(await subjectService.findById(ctx, subjectId))) {
    throw unprocessable("subjectId does not refer to an existing subject");
  }
};

/* ISBN is unique per school (when present) */
const checkIsbn = async (ctx, isbn, exceptBookId) => {
  if (!isbn) return;
  const existing = await bookRepository.findOne(
    ctx.tenantId,
    [eq(libraryBooks.isbn, isbn), exceptBookId && ne(libraryBooks.id, exceptBookId)].filter(Boolean)
  );
  if (existing) throw conflict(`A book with ISBN ${isbn} is already in the catalogue: ${existing.title}`);
};

export const bookService = {
  list: async (ctx, { page, limit, q, category, subjectId, available }) => {
    const result = await bookRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withSubject,
      conditions: [
        q && bookRepository.searchCondition(q),
        category && eq(libraryBooks.category, category),
        subjectId && eq(libraryBooks.subjectId, subjectId),
        available === true && bookRepository.availableCondition(ctx.tenantId)
      ].filter(Boolean)
    });
    return { ...result, rows: await withCopyCounts(ctx, result.rows) };
  },

  getById: async (ctx, bookId) => {
    const book = await bookRepository.findById(ctx.tenantId, bookId, { with: withSubject });
    if (!book) throw notFound("Book");
    const [withCounts] = await withCopyCounts(ctx, [book]);
    return withCounts;
  },

  create: async (ctx, data) => {
    await checkSubject(ctx, data.subjectId);
    await checkIsbn(ctx, data.isbn);
    const book = await bookRepository.create(ctx.tenantId, data);
    return bookService.getById(ctx, book.id);
  },

  update: async (ctx, bookId, data) => {
    await bookService.getById(ctx, bookId);
    await checkSubject(ctx, data.subjectId);
    await checkIsbn(ctx, data.isbn, bookId);
    await bookRepository.update(ctx.tenantId, bookId, data);
    return bookService.getById(ctx, bookId);
  },

  /* Removes the book and its copies; not while any copy is on loan */
  remove: async (ctx, bookId) => {
    return transaction(async tx => {
      const book = await bookRepository.lockForUpdate(ctx.tenantId, bookId, { dbc: tx });
      if (!book) throw notFound("Book");
      const copies = await copyService.lockAllOfBook(ctx, bookId, { dbc: tx });
      const onLoan = copies.filter(copy => copy.status === "ISSUED").length;
      if (onLoan) {
        throw conflict(
          `${onLoan} copy(ies) of ${book.title} are on loan; they must be returned before the book is removed`
        );
      }
      await copyService.removeAllOfBook(ctx, bookId, { dbc: tx });
      return bookRepository.softDelete(ctx.tenantId, bookId, { dbc: tx });
    });
  },

  /* For other submodules */
  findById: (ctx, bookId, options) => bookRepository.findById(ctx.tenantId, bookId, options),

  lockForUpdate: (ctx, bookId, options) => bookRepository.lockForUpdate(ctx.tenantId, bookId, options)
};
