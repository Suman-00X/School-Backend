import { eq, inArray, ne } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { bookService } from "../../books/index.js";
import { holdService } from "../../holds/index.js";
import { sendNotices } from "../../shared/jobs/notice.job.js";
import { nextAccessionNumbers } from "../../shared/utils/codes.util.js";
import { libraryCopies } from "../models/copy.schema.js";
import { copyRepository } from "../repositories/copy.repository.js";

const withBook = {
  book: { columns: { id: true, title: true, authors: true, isbn: true, shelfLocation: true, itemType: true } }
};

const assertBook = async (ctx, bookId) => {
  const book = await bookService.findById(ctx, bookId);
  if (!book) throw notFound("Book");
  return book;
};

/* Barcodes are unique per school (when present) */
const checkBarcode = async (ctx, barcode, exceptCopyId) => {
  if (!barcode) return;
  const existing = await copyRepository.findOne(
    ctx.tenantId,
    [eq(libraryCopies.barcode, barcode), exceptCopyId && ne(libraryCopies.id, exceptCopyId)].filter(Boolean)
  );
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
  /* Add `count` copies with consecutive accession numbers, all or none.
     New copies go to readers waiting for the title first. */
  addCopies: async (ctx, bookId, { count, ...details }) => {
    const today = await tenantToday(ctx.tenantId);
    const notices = [];
    const result = await transaction(async tx => {
      /* The lock keeps a concurrent removal of the book from orphaning new copies */
      const book = await bookService.lockForUpdate(ctx, bookId, { dbc: tx });
      if (!book) throw notFound("Book");
      const numbers = await nextAccessionNumbers(ctx.tenantId, count, { dbc: tx });
      const copies = await copyRepository.createMany(
        ctx.tenantId,
        numbers.map(accessionNumber => ({ ...details, bookId, accessionNumber })),
        { dbc: tx }
      );
      await holdService.fillQueue(ctx, book, { dbc: tx, today, notices });
      return { book, ids: copies.map(copy => copy.id) };
    });
    await sendNotices(ctx, notices);
    const copies = await copyRepository.findMany(ctx.tenantId, { conditions: [inArray(libraryCopies.id, result.ids)] });
    return { book: result.book, copies };
  },

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

  /* Status changes by hand: shelf (AVAILABLE), DAMAGED, LOST, MISSING, WITHDRAWN.
     A copy on loan only changes through circulation (return). A copy kept for a
     hold that leaves the shelf sends the hold back to the front of the queue;
     a copy put back on the shelf goes to the next reader waiting. */
  update: async (ctx, copyId, data) => {
    await checkBarcode(ctx, data.barcode, copyId);
    const today = await tenantToday(ctx.tenantId);
    const notices = [];
    await transaction(async tx => {
      const found = await copyRepository.findById(ctx.tenantId, copyId, { dbc: tx });
      if (!found) throw notFound("Copy");
      const book = await bookService.lockForUpdate(ctx, found.bookId, { dbc: tx });
      const copy = await copyRepository.lockById(ctx.tenantId, copyId, { dbc: tx });
      const statusChange = data.status && data.status !== copy.status;
      if (statusChange && copy.status === "ISSUED") {
        throw unprocessable(`Copy ${copy.accessionNumber} is on loan; record its return instead`);
      }
      if (statusChange && copy.status === "ON_HOLD") await holdService.releaseCopy(ctx, copy, { dbc: tx });
      const updated = await copyRepository.update(ctx.tenantId, copyId, data, { dbc: tx });
      if (statusChange && updated.status === "AVAILABLE") {
        await holdService.offerCopy(ctx, { book, copy: updated }, { dbc: tx, today, notices });
      } else if (statusChange && copy.status === "ON_HOLD") {
        await holdService.fillQueue(ctx, book, { dbc: tx, today, notices });
      }
    });
    await sendNotices(ctx, notices);
    return copyService.getById(ctx, copyId);
  },

  /* For other submodules (inside their transactions, with the book locked first) */
  lockById: (ctx, copyId, options) => copyRepository.lockById(ctx.tenantId, copyId, options),

  lockAllOfBook: (ctx, bookId, options) => copyRepository.lockAllOfBook(ctx.tenantId, bookId, options),

  lockAvailableOfBook: (ctx, bookId, options) => copyRepository.lockAvailableOfBook(ctx.tenantId, bookId, options),

  findById: (ctx, copyId, options) => copyRepository.findById(ctx.tenantId, copyId, options),

  /* A scanned accession number or barcode (null when unknown) */
  findByCode: (ctx, code, options) => copyRepository.findByCode(ctx.tenantId, code, options),

  findMany: (ctx, options) => copyRepository.findMany(ctx.tenantId, options),

  removeAllOfBook: (ctx, bookId, options) => copyRepository.softDeleteAllOfBook(ctx.tenantId, bookId, options),

  setStatus: (ctx, copyId, status, options) => copyRepository.update(ctx.tenantId, copyId, { status }, options),

  setStatusOfMany: (ctx, copyIds, status, options) =>
    copyIds.length ? copyRepository.setStatus(ctx.tenantId, copyIds, status, options) : null
};
