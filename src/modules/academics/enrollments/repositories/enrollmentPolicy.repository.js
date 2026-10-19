import { eq } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { enrollmentPolicies } from "../models/enrollmentPolicy.schema.js";

export const enrollmentPolicyRepository = {
  ...createRepository({ table: enrollmentPolicies, queryKey: "enrollmentPolicies" }),

  /* The school's policy, created with defaults the first time (safe under concurrency) */
  ensure: async (tenantId, { dbc = db } = {}) => {
    await dbc
      .insert(enrollmentPolicies)
      .values({ tenantId })
      .onConflictDoNothing({ target: enrollmentPolicies.tenantId });
    const [policy] = await dbc.select().from(enrollmentPolicies).where(eq(enrollmentPolicies.tenantId, tenantId));
    return policy;
  }
};
