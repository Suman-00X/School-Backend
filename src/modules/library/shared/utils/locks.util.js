import { sql } from "drizzle-orm";

/* Serializes everything that counts one borrower's loans, holds or credit until
   the transaction ends (two concurrent issues cannot both slip under a limit).
   Lock order everywhere: borrower, then loan, then book, then its copies and holds. */
export const lockBorrower = (tenantId, userId, { dbc }) =>
  dbc.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`library-borrower:${tenantId}:${userId}`}, 0))`);
