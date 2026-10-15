import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { subjects } from "../../../academics/subjects/models/subject.schema.js";

/* A title in the catalogue. Physical copies are library_copies. */
export const libraryBooks = pgTable(
  "library_books",
  {
    ...baseColumns(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    authors: text("authors")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /* Normalized: digits (and a final X for ISBN-10), no hyphens */
    isbn: text("isbn"),
    publisher: text("publisher"),
    publishedYear: integer("published_year"),
    edition: text("edition"),
    language: text("language"),
    category: text("category"),
    subjectId: uuid("subject_id").references(() => subjects.id),
    shelfLocation: text("shelf_location"),
    description: text("description")
  },
  t => [
    uniqueIndex("library_books_tenant_isbn_uq")
      .on(t.tenantId, t.isbn)
      .where(sql`${activeRows(t)} AND ${t.isbn} IS NOT NULL`),
    index("library_books_tenant_title_idx").on(t.tenantId, t.title),
    index("library_books_tenant_category_idx").on(t.tenantId, t.category),
    index("library_books_subject_idx").on(t.subjectId),
    check("library_books_year_chk", sql`${t.publishedYear} IS NULL OR ${t.publishedYear} BETWEEN 1000 AND 9999`),
    check("library_books_isbn_chk", sql`${t.isbn} IS NULL OR ${t.isbn} ~ '^([0-9]{9}[0-9X]|[0-9]{13})$'`)
  ]
);

export const libraryBooksRelations = relations(libraryBooks, ({ one }) => ({
  subject: one(subjects, { fields: [libraryBooks.subjectId], references: [subjects.id] })
}));
