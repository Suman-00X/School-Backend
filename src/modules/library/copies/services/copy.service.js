import { eq, ne } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { bookService } from "../../books/index.js";
import { nextAccessionNumbers } from "../../shared/utils/codes.util.js";
import { libraryCopies } from "../models/copy.schema.js";
import { copyRepository } from "../repositories/copy.repository.js";

const withBook = { book: { columns: { id: true, title: true, authors: true, isbn: true, shelfLocation: true } } };

const assertBook = async (ctx, bookId) => {
  const book = await bookService.findById(ctx, bookId);
  if (!book) throw notFound("Book");
  return book;
};

/* Barcodes are unique per school (when present) */
const checkBarcode = async (ctx, barcode, exceptCopyId) => {
  if (!barcode) return;
  const existing = await copyRepository.findOne(ctx.tenantId, [
    eq(libraryCopies.barcode, barcode),
    ne(libraryCopies.id, exceptCopyId)
  ]);
  if (existing) throw conflict(`Barcode ${barcode} is already used by copy ${existing.accessionNumber}`);
};

const filters = ({ status, bookId, accessionNumber, barcode }) =>
  [
    status && eq(libraryCopies.status, status),
    bookId && eq(libraryCopies.bookId, bookId),
    accessionNumber && eq(libraryCopies.accessionNumber, accessionNumber),
    barcode && eq(libraryCopies.barcode, barcode)
  ].filter(Boolean);

export const copyService = {
  /* Add `count` copies with consecutive accession numbers, all or none */
  addCopies: async (ctx, bookId, { count, price, acquiredOn, conditionNotes }) =>
    transaction(async tx => {
      /* The lock keeps a concurrent removal of the book from orphaning new copies */
      const book = await bookService.lockForUpdate(ctx, bookId, { dbc: tx });
      if (!book) throw notFound("Book");
      const numbers = await nextAccessionNumbers(ctx.tenantId, count, { dbc: tx });
      const copies = await copyRepository.createMany(
        ctx.tenantId,
        numbers.map(accessionNumber => ({ bookId, accessionNumber, price, acquiredOn, conditionNotes })),
        { dbc: tx }
      );
      return { book, copies };
    }),

  listForBook: async (ctx, bookId, { page, limit, status }) => {
    await assertBook(ctx, bookId);
    return copyRepository.list(ctx.tenantId, { page, limit, conditions: filters({ status, bookId }) });
  },

  /* Desk lookup: ?accessionNumber= or ?barcode= finds one copy */
  list: (ctx, { page, limit, ...query }) =>
    copyRepository.list(ctx.tenantId, { page, limit, with: withBook, conditions: filters(query) }),

  getById: async (ctx, copyId) => {
    const copy = await copyRepository.findById(ctx.tenantId, copyId, { with: withBook });
    if (!copy) throw notFound("Copy");
    return copy;
  },

  /* Status changes by hand: shelf (AVAILABLE), DAMAGED, LOST, WITHDRAWN.
     A copy on loan only changes through circulation (return). */
  update: async (ctx, copyId, data) => {
    await checkBarcode(ctx, data.barcode, copyId);
    await transaction(async tx => {
      const copy = await copyRepository.lockById(ctx.tenantId, copyId, { dbc: tx });
      if (!copy) throw notFound("Copy");
      if (data.status && data.status !== copy.status && copy.status === "ISSUED") {
        throw unprocessable(`Copy ${copy.accessionNumber} is on loan; record its return instead`);
      }
      await copyRepository.update(ctx.tenantId, copyId, data, { dbc: tx });
    });
    return copyService.getById(ctx, copyId);
  },

  /* For other submodules (inside their transactions) */
  lockById: (ctx, copyId, options) => copyRepository.lockById(ctx.tenantId, copyId, options),

  lockByAccessionNumber: (ctx, accessionNumber, options) =>
    copyRepository.lockByAccessionNumber(ctx.tenantId, accessionNumber, options),

  lockAllOfBook: (ctx, bookId, options) => copyRepository.lockAllOfBook(ctx.tenantId, bookId, options),

  removeAllOfBook: (ctx, bookId, options) => copyRepository.softDeleteAllOfBook(ctx.tenantId, bookId, options),

  setStatus: (ctx, copyId, status, options) => copyRepository.update(ctx.tenantId, copyId, { status }, options)
};
