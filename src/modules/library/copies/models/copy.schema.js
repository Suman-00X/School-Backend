import { relations, sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { libraryBooks, libraryItemType } from "../../books/models/book.schema.js";
import { COPY_STATUSES } from "../../shared/constants/library.constants.js";
import { money } from "../../shared/models/money.columns.js";

export const libraryCopyStatus = pgEnum("library_copy_status", COPY_STATUSES);

/* One physical copy of a book, identified by its accession number (ACC-000001) */
export const libraryCopies = pgTable(
  "library_copies",
  {
    ...baseColumns(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => libraryBooks.id),
    accessionNumber: text("accession_number").notNull(),
    barcode: text("barcode"),
    status: libraryCopyStatus("status").notNull().default("AVAILABLE"),
    /* Overrides the book's item type for this copy (null: the book's) */
    itemType: libraryItemType("item_type"),
    /* Replacement value, charged when the copy is lost on loan; caps late fines */
    price: money("price"),
    acquiredOn: date("acquired_on"),
    /* Where it came from (vendor, donation): staff only, like price and condition */
    source: text("source"),
    conditionNotes: text("condition_notes")
  },
  t => [
    /* Accession numbers come from a sequence and are never reused, even after removal */
    uniqueIndex("library_copies_tenant_accession_uq").on(t.tenantId, t.accessionNumber),
    uniqueIndex("library_copies_tenant_barcode_uq")
      .on(t.tenantId, t.barcode)
      .where(sql`${activeRows(t)} AND ${t.barcode} IS NOT NULL`),
    index("library_copies_book_idx").on(t.bookId, t.status),
    index("library_copies_acquired_idx").on(t.tenantId, t.acquiredOn),
    check("library_copies_price_chk", sql`${t.price} IS NULL OR ${t.price} >= 0`)
  ]
);

export const libraryCopiesRelations = relations(libraryCopies, ({ one }) => ({
  book: one(libraryBooks, { fields: [libraryCopies.bookId], references: [libraryBooks.id] })
}));
