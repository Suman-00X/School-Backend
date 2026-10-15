import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { libraryPolicies } from "../models/libraryPolicy.schema.js";

const base = createRepository({ table: libraryPolicies, queryKey: "libraryPolicies" });

export const libraryPolicyRepository = {
  ...base,

  /* The school's policy, inserting the defaults on first use.
     ON CONFLICT makes concurrent first reads safe. */
  findOrCreate: async (tenantId, { dbc = db } = {}) => {
    const existing = await base.findOne(tenantId, [], { dbc });
    if (existing) return existing;
    await dbc.insert(libraryPolicies).values({ tenantId }).onConflictDoNothing({ target: libraryPolicies.tenantId });
    return base.findOne(tenantId, [], { dbc });
  }
};
