import { asc, count, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { libraryBooks } from "../../books/models/book.schema.js";
import { libraryCopies } from "../../copies/models/copy.schema.js";
import { ON_PREMISES_COPY_STATUSES } from "../../shared/constants/library.constants.js";
import { libraryStockCheckScans as scans, libraryStockChecks as checks } from "../models/stockCheck.schema.js";

const checkRepository = createRepository({
  table: checks,
  queryKey: "libraryStockChecks",
  orderBy: desc(checks.startedAt)
});
const scanRepository = createRepository({
  table: scans,
  queryKey: "libraryStockCheckScans",
  orderBy: desc(scans.scannedAt)
});

/* The copy existed when the check began (compared in SQL, to the microsecond) */
const existedAtStart = check =>
  sql`${libraryCopies.createdAt} < (SELECT c.started_at FROM library_stock_checks c WHERE c.id = ${check.id} AND c.tenant_id = ${check.tenantId} AND c.is_active)`;

/* This check scanned the copy */
const scannedIn = check =>
  sql`EXISTS (SELECT 1 FROM library_stock_check_scans s WHERE s.stock_check_id = ${check.id} AND s.copy_id = ${libraryCopies.id} AND s.tenant_id = ${check.tenantId} AND s.is_active)`;

/* Copies the records place in the library, already there when the check began, not scanned */
const missingConditions = check => [
  inArray(libraryCopies.status, ON_PREMISES_COPY_STATUSES),
  existedAtStart(check),
  notExists(
    db
      .select({ one: sql`1` })
      .from(scans)
      .where(scoped(scans, check.tenantId, eq(scans.stockCheckId, check.id), eq(scans.copyId, libraryCopies.id)))
  )
];

const copyColumns = {
  id: libraryCopies.id,
  bookId: libraryCopies.bookId,
  accessionNumber: libraryCopies.accessionNumber,
  barcode: libraryCopies.barcode,
  status: libraryCopies.status,
  title: libraryBooks.title,
  shelfLocation: libraryBooks.shelfLocation
};

export const stockCheckRepository = {
  ...checkRepository,

  /* FOR SHARE while scanning (scanners run side by side), FOR UPDATE to close */
  lock: async (tenantId, checkId, strength, { dbc }) =>
    (
      await dbc
        .select()
        .from(checks)
        .where(scoped(checks, tenantId, eq(checks.id, checkId)))
        .for(strength)
    )[0] ?? null,

  findOpen: tenantId => checkRepository.findOne(tenantId, [eq(checks.status, "OPEN")]),

  /* One row per scanned copy (or unknown code); a repeat scan does nothing -> inserted or null */
  insertScan: async (tenantId, values, { dbc }) =>
    (
      await dbc
        .insert(scans)
        .values({ ...values, tenantId })
        .onConflictDoNothing()
        .returning()
    )[0] ?? null,

  scanCounts: async (tenantId, checkId, { dbc = db } = {}) =>
    Object.fromEntries(
      (
        await dbc
          .select({ result: scans.result, scans: count() })
          .from(scans)
          .where(scoped(scans, tenantId, eq(scans.stockCheckId, checkId)))
          .groupBy(scans.result)
      ).map(row => [row.result, row.scans])
    ),

  /* Copies expected on the shelves now (on the premises when the check began) */
  countExpected: (tenantId, check, { dbc = db } = {}) =>
    dbc.$count(
      libraryCopies,
      scoped(libraryCopies, tenantId, inArray(libraryCopies.status, ON_PREMISES_COPY_STATUSES), existedAtStart(check))
    ),

  countMissing: (tenantId, check) =>
    db.$count(libraryCopies, scoped(libraryCopies, tenantId, ...missingConditions(check))),

  /* Page of missing copies, by shelf then accession number */
  listMissing: async (tenantId, check, { page, limit }) => {
    const where = scoped(libraryCopies, tenantId, ...missingConditions(check));
    const [rows, total] = await Promise.all([
      db
        .select(copyColumns)
        .from(libraryCopies)
        .innerJoin(libraryBooks, eq(libraryBooks.id, libraryCopies.bookId))
        .where(where)
        .orderBy(asc(libraryBooks.shelfLocation), asc(libraryCopies.accessionNumber))
        .limit(limit)
        .offset((page - 1) * limit),
      db.$count(libraryCopies, where)
    ]);
    return { rows, total };
  },

  /* Every missing copy, for the closure (inside its transaction) */
  findMissing: (tenantId, check, { dbc }) =>
    dbc
      .select({ id: libraryCopies.id, bookId: libraryCopies.bookId })
      .from(libraryCopies)
      .where(scoped(libraryCopies, tenantId, ...missingConditions(check))),

  /* Scanned copies recorded as MISSING: found again */
  findRecovered: (tenantId, check, { dbc }) =>
    dbc
      .select({ id: libraryCopies.id, bookId: libraryCopies.bookId })
      .from(libraryCopies)
      .where(scoped(libraryCopies, tenantId, eq(libraryCopies.status, "MISSING"), scannedIn(check))),

  /* Is this copy still unscanned (re-checked under the copy's lock) */
  wasScanned: async (check, copyId, { dbc }) =>
    (await dbc.$count(
      scans,
      scoped(scans, check.tenantId, eq(scans.stockCheckId, check.id), eq(scans.copyId, copyId))
    )) > 0,

  /* Scans that need a look: copies the records place elsewhere, and unknown codes */
  listScans: (tenantId, checkId, { page, limit, results }) =>
    scanRepository.list(tenantId, {
      page,
      limit,
      conditions: [eq(scans.stockCheckId, checkId), inArray(scans.result, results)],
      with: {
        copy: {
          columns: { id: true, accessionNumber: true, status: true },
          with: { book: { columns: { id: true, title: true } } }
        }
      }
    })
};
