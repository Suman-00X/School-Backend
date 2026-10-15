import { sql } from "drizzle-orm";
import { db } from "../../database/postgres/client.js";
import { serialCounters } from "../../database/postgres/schema/index.js";

/* Atomically take the next number in a tenant's sequence. Inside a
   transaction the increment rolls back with it, so codes have no gaps. */
export const getNextSerial = async ({
  tenantId,
  scope,
  dbc = db
}) => {
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
