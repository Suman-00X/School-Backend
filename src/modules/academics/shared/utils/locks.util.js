import { sql } from "drizzle-orm";

/* Transaction-scoped advisory lock on a key, for invariants over rows that may
   not exist yet ("one plan per lesson and date"), where there is no
   row to `select ... for update`. Released at commit or rollback. */
export const lockKey = (tx, ...parts) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${parts.join(":")}, 0))`);
