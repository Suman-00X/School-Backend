import { and, asc, desc, eq, ne } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { resultPolicies, resultPolicyAssignments, resultPolicySubjects } from "../models/resultPolicy.schema.js";

export const resultPolicyRepository = {
  ...createRepository({
    table: resultPolicies,
    queryKey: "resultPolicies",
    orderBy: [desc(resultPolicies.isDefault), asc(resultPolicies.name)]
  }),

  clearDefault: (tenantId, exceptId, { dbc = db } = {}) =>
    dbc
      .update(resultPolicies)
      .set({ isDefault: false })
      .where(
        and(
          eq(resultPolicies.tenantId, tenantId),
          eq(resultPolicies.isDefault, true),
          exceptId ? ne(resultPolicies.id, exceptId) : undefined
        )
      )
};

export const resultPolicySubjectRepository = {
  ...createRepository({ table: resultPolicySubjects, queryKey: "resultPolicySubjects" }),

  /* Subject rules belong to their policy and are replaced as a set */
  replaceForPolicy: async (tenantId, policyId, rules, { dbc = db } = {}) => {
    await dbc
      .delete(resultPolicySubjects)
      .where(and(eq(resultPolicySubjects.tenantId, tenantId), eq(resultPolicySubjects.policyId, policyId)));
    return rules.length
      ? dbc
          .insert(resultPolicySubjects)
          .values(rules.map(rule => ({ ...rule, policyId, tenantId })))
          .returning()
      : [];
  }
};

export const resultPolicyAssignmentRepository = createRepository({
  table: resultPolicyAssignments,
  queryKey: "resultPolicyAssignments"
});
