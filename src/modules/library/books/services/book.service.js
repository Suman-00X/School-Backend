import { eq, ne } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { subjectService } from "../../../academics/subjects/index.js";
import { copyService } from "../../copies/index.js";
import { COPY_STATUSES } from "../../shared/constants/library.constants.js";
import { libraryBooks } from "../models/book.schema.js";
import { bookRepository } from "../repositories/book.repository.js";

const withSubject = { subject: { columns: { id: true, subjectName: true, subjectCode: true } } };

/* "ON_HOLD" -> "onHold" */
const countKey = status => status.toLowerCase().replace(/_(\w)/g, (_, char) => char.toUpperCase());

/* { total, available, issued, onHold, lost, damaged, withdrawn, missing } per book id.
   `total` is the collection: every copy that has not been withdrawn. */
const copyCountsFor = async (ctx, bookIds) => {
  const empty = () => Object.fromEntries([["total", 0], ...COPY_STATUSES.map(status => [countKey(status), 0])]);
  const counts = new Map(bookIds.map(id => [id, empty()]));
  for (const { bookId, status, copies } of await bookRepository.countCopiesByStatus(ctx.tenantId, bookIds)) {
    const entry = counts.get(bookId);
    entry[countKey(status)] = copies;
    if (status !== "WITHDRAWN") entry.total += copies;
  }
  return counts;
};

const withCopyCounts = async (ctx, books) => {
  const ids = books.map(book => book.id);
  const [counts, holds] = await Promise.all([
    copyCountsFor(ctx, ids),
    bookRepository.countWaitingHolds(ctx.tenantId, ids)
  ]);
  const waiting = new Map(holds.map(row => [row.bookId, row.waiting]));
  return books.map(book => ({ ...book, copies: counts.get(book.id), holdsWaiting: waiting.get(book.id) ?? 0 }));
};

/* What students, parents and teachers see: no internal notes, prices or condition */
const PUBLIC_FIELDS = [
  "id",
  "title",
  "subtitle",
  "authors",
  "isbn",
  "publisher",
  "publishedYear",
  "edition",
  "language",
  "category",
  "itemType",
  "subject",
  "shelfLocation",
  "description"
];

const toPublic = book => ({
  ...Object.fromEntries(PUBLIC_FIELDS.map(field => [field, book[field] ?? null])),
  availability: {
    total: book.copies.available + book.copies.issued + book.copies.onHold,
    available: book.copies.available,
    onLoan: book.copies.issued,
    onHold: book.copies.onHold,
    holdsWaiting: book.holdsWaiting
  },
  /* Reference titles are read in the library */
  canBeBorrowed: book.itemType !== "REFERENCE"
});

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

const listConditions = (ctx, { q, category, subjectId, itemType, available }) =>
  [
    q && bookRepository.searchCondition(q),
    category && eq(libraryBooks.category, category),
    subjectId && eq(libraryBooks.subjectId, subjectId),
    itemType && eq(libraryBooks.itemType, itemType),
    available === true && bookRepository.availableCondition(ctx.tenantId)
  ].filter(Boolean);

export const bookService = {
  list: async (ctx, { page, limit, ...filters }) => {
    const result = await bookRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withSubject,
      conditions: listConditions(ctx, filters)
    });
    return { ...result, rows: await withCopyCounts(ctx, result.rows) };
  },

  getById: async (ctx, bookId) => {
    const book = await bookRepository.findById(ctx.tenantId, bookId, { with: withSubject });
    if (!book) throw notFound("Book");
    const [withCounts] = await withCopyCounts(ctx, [book]);
    return withCounts;
  },

  /* Public catalogue (every role): search and availability, no staff-only fields */
  catalogue: async (ctx, query) => {
    const result = await bookService.list(ctx, query);
    return { ...result, rows: result.rows.map(toPublic) };
  },

  catalogueEntry: async (ctx, bookId) => {
    const book = await bookService.getById(ctx, bookId);
    const copies = await bookRepository.circulatingCopies(ctx.tenantId, bookId);
    return {
      ...toPublic(book),
      copies: copies.map(copy => ({
        accessionNumber: copy.accessionNumber,
        status: copy.status,
        itemType: copy.itemType ?? book.itemType,
        dueDate: copy.status === "ISSUED" ? copy.dueDate : null
      }))
    };
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

  /* Removes the book and its copies; not while a copy is on loan or a hold is open */
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
      const holds = await bookRepository.countOpenHolds(ctx.tenantId, bookId, { dbc: tx });
      if (holds) throw conflict(`${holds} hold(s) on ${book.title} are open; cancel them before the book is removed`);
      await copyService.removeAllOfBook(ctx, bookId, { dbc: tx });
      return bookRepository.softDelete(ctx.tenantId, bookId, { dbc: tx });
    });
  },

  /* For other submodules */
  findById: (ctx, bookId, options) => bookRepository.findById(ctx.tenantId, bookId, options),

  lockForUpdate: (ctx, bookId, options) => bookRepository.lockForUpdate(ctx.tenantId, bookId, options)
};
