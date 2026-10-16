import { sql } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";

/* Read model for library reports: library tables only, filtered by tenant_id and
   is_active; money sums are exact in SQL. Names of people come from the users module. */
const rows = async query => (await db.execute(query)).rows;

export const reportQueries = {
  /* Fine payments received between two dates (school time zone), newest first */
  finePayments: (tenantId, from, to, timeZone) =>
    rows(sql`
      SELECT p.id, p.receipt_number AS "receiptNumber", p.amount::float8 AS amount, p.method,
             (p.paid_at AT TIME ZONE ${timeZone})::date::text AS "paidOn",
             l.borrower_user_id AS "borrowerUserId", b.title, c.accession_number AS "accessionNumber"
      FROM library_fine_payments p
      JOIN library_loans l ON l.id = p.loan_id
      JOIN library_books b ON b.id = l.book_id
      JOIN library_copies c ON c.id = l.copy_id
      WHERE p.tenant_id = ${tenantId} AND p.is_active
        AND (p.paid_at AT TIME ZONE ${timeZone})::date BETWEEN ${from}::date AND ${to}::date
      ORDER BY p.paid_at DESC`),

  /* Waivers granted between two dates */
  waiverTotal: async (tenantId, from, to, timeZone) =>
    (
      await rows(sql`
        SELECT coalesce(sum(w.amount), 0)::float8 AS total, count(*)::int AS count
        FROM library_fine_waivers w
        WHERE w.tenant_id = ${tenantId} AND w.is_active
          AND (w.waived_at AT TIME ZONE ${timeZone})::date BETWEEN ${from}::date AND ${to}::date`)
    )[0],

  /* Titles by loans issued between two dates */
  mostBorrowed: (tenantId, from, to, limit) =>
    rows(sql`
      SELECT b.id AS "bookId", b.title, array_to_string(b.authors, ', ') AS authors, b.category,
             count(*)::int AS loans, count(DISTINCT l.borrower_user_id)::int AS borrowers
      FROM library_loans l
      JOIN library_books b ON b.id = l.book_id
      WHERE l.tenant_id = ${tenantId} AND l.is_active
        AND l.issued_on BETWEEN ${from}::date AND ${to}::date
      GROUP BY b.id, b.title, b.authors, b.category
      ORDER BY loans DESC, b.title
      LIMIT ${limit}`),

  /* Latest loan of every borrower who ever borrowed */
  lastLoanByBorrower: tenantId =>
    rows(sql`
      SELECT l.borrower_user_id AS "userId", max(l.issued_on)::text AS "lastIssuedOn", count(*)::int AS loans
      FROM library_loans l
      WHERE l.tenant_id = ${tenantId} AND l.is_active
      GROUP BY l.borrower_user_id`),

  /* Copies added between two dates (acquisition date, else the day they were catalogued) */
  acquisitions: (tenantId, from, to, timeZone) =>
    rows(sql`
      SELECT c.id, c.accession_number AS "accessionNumber", b.title, array_to_string(b.authors, ', ') AS authors,
             coalesce(c.item_type, b.item_type) AS "itemType", c.status, c.price::float8 AS price, c.source,
             coalesce(c.acquired_on, (c.created_at AT TIME ZONE ${timeZone})::date)::text AS "acquiredOn"
      FROM library_copies c
      JOIN library_books b ON b.id = c.book_id
      WHERE c.tenant_id = ${tenantId} AND c.is_active AND b.is_active
        AND coalesce(c.acquired_on, (c.created_at AT TIME ZONE ${timeZone})::date) BETWEEN ${from}::date AND ${to}::date
      ORDER BY "acquiredOn", c.accession_number`)
};
