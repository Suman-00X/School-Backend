import { relations, sql } from "drizzle-orm";
import { check, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { libraryCopies, libraryCopyStatus } from "../../copies/models/copy.schema.js";
import { SCAN_RESULTS, STOCK_CHECK_STATUSES } from "../../shared/constants/library.constants.js";

export const libraryStockCheckStatus = pgEnum("library_stock_check_status", STOCK_CHECK_STATUSES);
export const libraryScanResult = pgEnum("library_scan_result", SCAN_RESULTS);

/* A stock-take: scan what is on the shelves, compare with the records, close */
export const libraryStockChecks = pgTable(
  "library_stock_checks",
  {
    ...baseColumns(),
    title: text("title").notNull(),
    status: libraryStockCheckStatus("status").notNull().default("OPEN"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    startedOn: date("started_on").notNull(),
    closedOn: date("closed_on"),
    startedBy: uuid("started_by").references(() => users.id),
    closedBy: uuid("closed_by").references(() => users.id),
    /* Filled at closure */
    expectedCount: integer("expected_count"),
    foundCount: integer("found_count"),
    missingCount: integer("missing_count"),
    unexpectedCount: integer("unexpected_count"),
    notes: text("notes")
  },
  t => [
    /* One open stock check per school */
    uniqueIndex("library_stock_checks_open_uq")
      .on(t.tenantId)
      .where(sql`${activeRows(t)} AND ${t.status} = 'OPEN'`),
    check("library_stock_checks_closed_chk", sql`(${t.status} = 'CLOSED') = (${t.closedOn} IS NOT NULL)`)
  ]
);

/* One scanned code. A copy is recorded once per check (scanning it again is a no-op). */
export const libraryStockCheckScans = pgTable(
  "library_stock_check_scans",
  {
    ...baseColumns(),
    stockCheckId: uuid("stock_check_id")
      .notNull()
      .references(() => libraryStockChecks.id),
    /* As scanned: an accession number or a barcode */
    code: text("code").notNull(),
    copyId: uuid("copy_id").references(() => libraryCopies.id),
    result: libraryScanResult("result").notNull(),
    /* The copy's status when it was scanned */
    copyStatus: libraryCopyStatus("copy_status"),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
    scannedBy: uuid("scanned_by").references(() => users.id)
  },
  t => [
    uniqueIndex("library_stock_check_scans_copy_uq")
      .on(t.stockCheckId, t.copyId)
      .where(sql`${t.copyId} IS NOT NULL`),
    uniqueIndex("library_stock_check_scans_unknown_uq")
      .on(t.stockCheckId, t.code)
      .where(sql`${t.copyId} IS NULL`),
    index("library_stock_check_scans_check_idx").on(t.stockCheckId, t.result),
    check("library_stock_check_scans_copy_chk", sql`(${t.result} = 'UNKNOWN') = (${t.copyId} IS NULL)`)
  ]
);

export const libraryStockChecksRelations = relations(libraryStockChecks, ({ many }) => ({
  scans: many(libraryStockCheckScans)
}));

export const libraryStockCheckScansRelations = relations(libraryStockCheckScans, ({ one }) => ({
  stockCheck: one(libraryStockChecks, {
    fields: [libraryStockCheckScans.stockCheckId],
    references: [libraryStockChecks.id]
  }),
  copy: one(libraryCopies, { fields: [libraryStockCheckScans.copyId], references: [libraryCopies.id] })
}));
