import { eq } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { nepPolicies } from "../models/nepPolicy.schema.js";

export const nepPolicyRepository = {
  ...createRepository({ table: nepPolicies, queryKey: "nepPolicies" }),

  /* The school's policy, created with defaults the first time (safe under concurrency) */
  ensure: async (tenantId, { dbc = db } = {}) => {
    await dbc.insert(nepPolicies).values({ tenantId }).onConflictDoNothing({ target: nepPolicies.tenantId });
    const [policy] = await dbc.select().from(nepPolicies).where(eq(nepPolicies.tenantId, tenantId));
    return policy;
  }
};
