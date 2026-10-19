import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { lateFeeRules, lateFeeSlabs } from "../models/lateFeeRule.schema.js";

export const lateFeeRuleRepository = {
  ...createRepository({ table: lateFeeRules, queryKey: "lateFeeRules", orderBy: asc(lateFeeRules.name) }),

  /* Slabs belong to the rule and are replaced as a set */
  replaceSlabs: async (tenantId, lateFeeRuleId, slabs, { dbc = db } = {}) => {
    await dbc
      .delete(lateFeeSlabs)
      .where(and(eq(lateFeeSlabs.tenantId, tenantId), eq(lateFeeSlabs.lateFeeRuleId, lateFeeRuleId)));
    await dbc.insert(lateFeeSlabs).values(slabs.map(slab => ({ ...slab, lateFeeRuleId, tenantId })));
  },

  /* The school's default rule is not default any more */
  clearDefault: (tenantId, { dbc = db } = {}) =>
    dbc
      .update(lateFeeRules)
      .set({ isDefault: false })
      .where(and(eq(lateFeeRules.tenantId, tenantId), eq(lateFeeRules.isDefault, true))),

  /* All tenants (daily job): the given rules plus each tenant's default, with slabs */
  findForJob: (ruleIds, tenantIds) =>
    tenantIds.length
      ? db.query.lateFeeRules.findMany({
          where: and(
            eq(lateFeeRules.isActive, true),
            inArray(lateFeeRules.tenantId, tenantIds),
            or(ruleIds.length ? inArray(lateFeeRules.id, ruleIds) : undefined, eq(lateFeeRules.isDefault, true))
          ),
          with: { slabs: { orderBy: [asc(lateFeeSlabs.fromDay)] } }
        })
      : []
};

describeDuplicates({
  late_fee_rules_name_uq: ({ name }) => `A late-fee rule named ${name} already exists`
});
