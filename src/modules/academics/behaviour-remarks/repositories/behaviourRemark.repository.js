import { count, max, sql } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { behaviourRemarks } from "../models/behaviourRemark.schema.js";

const base = createRepository({ table: behaviourRemarks, queryKey: "behaviourRemarks" });

export const behaviourRemarkRepository = {
  ...base,

  /* Counts per kind, how many wait for a parent's acknowledgement, and the latest date */
  summary: async (tenantId, conditions = []) => {
    const rows = await db
      .select({
        kind: behaviourRemarks.kind,
        count: count(),
        unacknowledged: sql`count(*) filter (where ${behaviourRemarks.acknowledgedAt} is null)`.mapWith(Number),
        lastOn: max(behaviourRemarks.occurredOn)
      })
      .from(behaviourRemarks)
      .where(scoped(behaviourRemarks, tenantId, ...conditions))
      .groupBy(behaviourRemarks.kind);
    return rows;
  }
};
