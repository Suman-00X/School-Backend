import { db } from "../../../../common/database/postgres.js";
import { circulationRuleService } from "../../circulation-rules/index.js";
import { libraryPolicyRepository } from "../repositories/libraryPolicy.repository.js";

export const libraryPolicyService = {
  /* The school's settings, created with the default circulation rules on first use.
     Also used by circulation (pass { dbc: tx } inside a transaction). */
  get: async (ctx, { dbc = db } = {}) => {
    const existing = await libraryPolicyRepository.findOne(ctx.tenantId, [], { dbc });
    if (existing) return existing;
    return dbc.transaction(async tx => {
      const created = await libraryPolicyRepository.insertDefault(ctx.tenantId, { dbc: tx });
      if (!created) return libraryPolicyRepository.findOne(ctx.tenantId, [], { dbc: tx });
      await circulationRuleService.seedDefaults(ctx, { dbc: tx });
      return created;
    });
  },

  update: async (ctx, changes) => {
    const policy = await libraryPolicyService.get(ctx);
    return libraryPolicyRepository.update(ctx.tenantId, policy.id, changes);
  }
};
