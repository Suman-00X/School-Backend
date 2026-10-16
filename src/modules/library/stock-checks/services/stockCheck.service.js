import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { bookService } from "../../books/index.js";
import { copyService } from "../../copies/index.js";
import { holdService } from "../../holds/index.js";
import { ON_PREMISES_COPY_STATUSES } from "../../shared/constants/library.constants.js";
import { sendNotices } from "../../shared/jobs/notice.job.js";
import { stockCheckRepository } from "../repositories/stockCheck.repository.js";

const assertOpen = check => {
  if (!check) throw notFound("Stock check");
  if (check.status !== "OPEN") throw conflict(`Stock check "${check.title}" was closed on ${check.closedOn}`);
  return check;
};

const summaryOf = async (ctx, check) => {
  const counts = await stockCheckRepository.scanCounts(ctx.tenantId, check.id);
  if (check.status === "CLOSED") {
    return {
      expected: check.expectedCount,
      found: check.foundCount,
      missing: check.missingCount,
      unexpected: check.unexpectedCount,
      unknown: counts.UNKNOWN ?? 0
    };
  }
  const [expected, missing] = await Promise.all([
    stockCheckRepository.countExpected(ctx.tenantId, check),
    stockCheckRepository.countMissing(ctx.tenantId, check)
  ]);
  return {
    expected,
    found: counts.FOUND ?? 0,
    missing,
    unexpected: counts.UNEXPECTED ?? 0,
    unknown: counts.UNKNOWN ?? 0
  };
};

/* Lock each affected book (in id order), then its copies: the module's lock order */
const lockBooks = async (ctx, bookIds, dbc) => {
  const books = new Map();
  for (const bookId of [...new Set(bookIds)].sort()) {
    books.set(bookId, await bookService.lockForUpdate(ctx, bookId, { dbc }));
  }
  return books;
};

export const stockCheckService = {
  start: async (ctx, { title, notes }) => {
    const open = await stockCheckRepository.findOpen(ctx.tenantId);
    if (open)
      throw conflict(`Stock check "${open.title}" is already open (started on ${open.startedOn}); close it first`);
    const check = await stockCheckRepository.create(ctx.tenantId, {
      title,
      notes,
      startedOn: await tenantToday(ctx.tenantId),
      startedBy: ctx.userId
    });
    return stockCheckService.getById(ctx, check.id);
  },

  list: (ctx, { page, limit }) => stockCheckRepository.list(ctx.tenantId, { page, limit }),

  getById: async (ctx, checkId) => {
    const check = await stockCheckRepository.findById(ctx.tenantId, checkId);
    if (!check) throw notFound("Stock check");
    return { ...check, summary: await summaryOf(ctx, check) };
  },

  /* Record scanned accession numbers or barcodes. Scanning a copy twice is harmless. */
  scan: async (ctx, checkId, { codes }) => {
    const results = await transaction(async tx => {
      assertOpen(await stockCheckRepository.lock(ctx.tenantId, checkId, "share", { dbc: tx }));
      const recorded = [];
      for (const code of codes) {
        const copy = await copyService.findByCode(ctx, code, { dbc: tx });
        const book = copy ? await bookService.findById(ctx, copy.bookId, { dbc: tx }) : null;
        const result = !copy ? "UNKNOWN" : ON_PREMISES_COPY_STATUSES.includes(copy.status) ? "FOUND" : "UNEXPECTED";
        const scan = await stockCheckRepository.insertScan(
          ctx.tenantId,
          {
            stockCheckId: checkId,
            code,
            copyId: copy?.id ?? null,
            result,
            copyStatus: copy?.status ?? null,
            scannedBy: ctx.userId
          },
          { dbc: tx }
        );
        recorded.push({
          code,
          result,
          repeated: !scan,
          accessionNumber: copy?.accessionNumber ?? null,
          title: book?.title ?? null,
          copyStatus: copy?.status ?? null
        });
      }
      return recorded;
    });
    return { results, summary: (await stockCheckService.getById(ctx, checkId)).summary };
  },

  missing: async (ctx, checkId, { page, limit }) => {
    const check = await stockCheckRepository.findById(ctx.tenantId, checkId);
    if (!check) throw notFound("Stock check");
    if (check.status === "CLOSED") {
      /* After closure the missing copies carry the MISSING status */
      return copyService.list(ctx, { page, limit, status: "MISSING" });
    }
    const { rows, total } = await stockCheckRepository.listMissing(ctx.tenantId, check, { page, limit });
    return { rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },

  unexpected: async (ctx, checkId, { page, limit }) => {
    const check = await stockCheckRepository.findById(ctx.tenantId, checkId);
    if (!check) throw notFound("Stock check");
    return stockCheckRepository.listScans(ctx.tenantId, checkId, { page, limit, results: ["UNEXPECTED", "UNKNOWN"] });
  },

  /* Close: copies not scanned become MISSING (a copy kept for a hold sends the hold
     back to the queue); scanned copies recorded as MISSING are back in circulation */
  close: async (ctx, checkId) => {
    const today = await tenantToday(ctx.tenantId);
    const notices = [];
    await transaction(async tx => {
      const check = assertOpen(await stockCheckRepository.lock(ctx.tenantId, checkId, "update", { dbc: tx }));
      const expected = await stockCheckRepository.countExpected(ctx.tenantId, check, { dbc: tx });
      const missing = await stockCheckRepository.findMissing(ctx.tenantId, check, { dbc: tx });
      const recovered = await stockCheckRepository.findRecovered(ctx.tenantId, check, { dbc: tx });
      const books = await lockBooks(
        ctx,
        [...missing, ...recovered].map(copy => copy.bookId),
        tx
      );

      let missingCount = 0;
      for (const { id } of missing) {
        const copy = await copyService.lockById(ctx, id, { dbc: tx });
        /* Re-checked under the lock: it may have been issued or scanned meanwhile */
        if (!copy || !ON_PREMISES_COPY_STATUSES.includes(copy.status)) continue;
        if (await stockCheckRepository.wasScanned(check, id, { dbc: tx })) continue;
        if (copy.status === "ON_HOLD") await holdService.releaseCopy(ctx, copy, { dbc: tx });
        await copyService.setStatus(ctx, id, "MISSING", { dbc: tx });
        missingCount++;
      }
      for (const { id, bookId } of recovered) {
        const copy = await copyService.lockById(ctx, id, { dbc: tx });
        if (copy?.status === "MISSING")
          await holdService.offerCopy(ctx, { book: books.get(bookId), copy }, { dbc: tx, today, notices });
      }
      /* Holds whose copy went missing take another copy from the shelf, if any */
      for (const book of books.values()) await holdService.fillQueue(ctx, book, { dbc: tx, today, notices });

      const counts = await stockCheckRepository.scanCounts(ctx.tenantId, checkId, { dbc: tx });
      await stockCheckRepository.update(
        ctx.tenantId,
        checkId,
        {
          status: "CLOSED",
          closedOn: today,
          closedBy: ctx.userId,
          expectedCount: expected,
          foundCount: counts.FOUND ?? 0,
          missingCount,
          unexpectedCount: counts.UNEXPECTED ?? 0
        },
        { dbc: tx }
      );
    });
    await sendNotices(ctx, notices);
    return stockCheckService.getById(ctx, checkId);
  }
};
