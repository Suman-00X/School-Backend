import { eq } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { examEligibilityExemptions, examEligibilityPolicies } from "../models/examEligibility.schema.js";

export const examEligibilityPolicyRepository = {
  ...createRepository({ table: examEligibilityPolicies, queryKey: "examEligibilityPolicies" }),

  /* The school's policy, created with defaults the first time (safe under concurrency) */
  ensure: async (tenantId, { dbc = db } = {}) => {
    await dbc
      .insert(examEligibilityPolicies)
      .values({ tenantId })
      .onConflictDoNothing({ target: examEligibilityPolicies.tenantId });
    const [policy] = await dbc
      .select()
      .from(examEligibilityPolicies)
      .where(eq(examEligibilityPolicies.tenantId, tenantId));
    return policy;
  }
};

export const examEligibilityExemptionRepository = createRepository({
  table: examEligibilityExemptions,
  queryKey: "examEligibilityExemptions"
});

describeDuplicates({
  exam_eligibility_exemptions_exam_student_uq: () => "The student is already allowed to sit this exam"
});
