import { libraryPolicyRepository } from "../repositories/libraryPolicy.repository.js";

export const libraryPolicyService = {
  /* Also used by circulation (pass { dbc: tx } inside a transaction) */
  get: (ctx, options) => libraryPolicyRepository.findOrCreate(ctx.tenantId, options),

  update: async (ctx, changes) => {
    const policy = await libraryPolicyService.get(ctx);
    return libraryPolicyRepository.update(ctx.tenantId, policy.id, changes);
  }
};
