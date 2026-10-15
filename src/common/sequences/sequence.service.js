import { sql } from "drizzle-orm";
import { db } from "../database/postgres.js";
import { serialCounters } from "../database/platform.schema.js";

/* Atomically take the next number in a tenant's named sequence.
   Inside a transaction the increment rolls back with it, so there are no gaps. */
export const nextSequence = async (tenantId, scope, { dbc = db } = {}) => {
  const [counter] = await dbc
    .insert(serialCounters)
    .values({ tenantId, scope, seq: 1 })
    .onConflictDoUpdate({
      target: [serialCounters.tenantId, serialCounters.scope],
      set: { seq: sql`${serialCounters.seq} + 1`, updatedAt: new Date() }
    })
    .returning({ seq: serialCounters.seq });

  return counter.seq;
};

/* nextCode(tenantId, "TEACHER-26", n => `TCHR26-${pad(n, 6)}`) */
export const nextCode = async (tenantId, scope, format, options) =>
  format(await nextSequence(tenantId, scope, options));

export const pad = (number, width) => String(number).padStart(width, "0");
