import { and, eq, sql } from "drizzle-orm";
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

/* Hold a sequence for the rest of the transaction (nobody can take a number meanwhile)
   -> the last number taken (0 when none). Call inside a transaction. */
export const lockSequence = async (tenantId, scope, { dbc }) => {
  await dbc.insert(serialCounters).values({ tenantId, scope, seq: 0 }).onConflictDoNothing();
  const [counter] = await dbc
    .select({ seq: serialCounters.seq })
    .from(serialCounters)
    .where(and(eq(serialCounters.tenantId, tenantId), eq(serialCounters.scope, scope)))
    .for("update");
  return counter.seq;
};

/* Restart a sequence after its numbers were re-issued: the next number taken is value + 1 */
export const setSequence = async (tenantId, scope, value, { dbc = db } = {}) => {
  await dbc
    .insert(serialCounters)
    .values({ tenantId, scope, seq: value })
    .onConflictDoUpdate({
      target: [serialCounters.tenantId, serialCounters.scope],
      set: { seq: value, updatedAt: new Date() }
    });
};

/* nextCode(tenantId, "TEACHER-26", n => `TCHR26-${pad(n, 6)}`) */
export const nextCode = async (tenantId, scope, format, options) =>
  format(await nextSequence(tenantId, scope, options));

export const pad = (number, width) => String(number).padStart(width, "0");
