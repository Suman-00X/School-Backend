import { and, desc, eq, max } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { certificateFormatVersions as versions } from "../models/certificate.schema.js";

export const certificateFormatRepository = {
  ...createRepository({ table: versions, queryKey: "certificateFormatVersions", orderBy: [desc(versions.version)] }),

  /* Version 1 of each type the school has none of yet (safe under concurrency) */
  ensureFirst: (tenantId, rows, { dbc = db } = {}) =>
    rows.length
      ? dbc
          .insert(versions)
          .values(rows.map(row => ({ ...row, tenantId, version: 1 })))
          .onConflictDoNothing()
      : null,

  /* The highest version of a type (0 when none) */
  latestNumber: async (tenantId, type, { dbc = db } = {}) => {
    const [row] = await dbc
      .select({ version: max(versions.version) })
      .from(versions)
      .where(and(eq(versions.tenantId, tenantId), eq(versions.type, type), eq(versions.isActive, true)));
    return row?.version ?? 0;
  }
};
