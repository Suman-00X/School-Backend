import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { libraryPolicies } from "../models/libraryPolicy.schema.js";

const base = createRepository({ table: libraryPolicies, queryKey: "libraryPolicies" });

export const libraryPolicyRepository = {
  ...base,

  /* Inserts the school's policy with the defaults -> the new row, or null when one
     already exists. A concurrent insert waits on the unique index until the first
     commits, so whoever gets a row back is the only one seeding. */
  insertDefault: async (tenantId, { dbc = db } = {}) => {
    const [row] = await dbc
      .insert(libraryPolicies)
      .values({ tenantId })
      .onConflictDoNothing({ target: libraryPolicies.tenantId })
      .returning();
    return row ?? null;
  }
};
