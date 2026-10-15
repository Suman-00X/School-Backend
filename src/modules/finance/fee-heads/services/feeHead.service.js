import { inArray } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { feeHeads } from "../models/feeHead.schema.js";
import { feeHeadRepository } from "../repositories/feeHead.repository.js";

export const feeHeadService = {
  ...createCrudService(feeHeadRepository, { entity: "Fee head" }),

  /* For other submodules: true when every id is an active fee head */
  allExist: async (ctx, ids) => {
    const unique = [...new Set(ids)];
    return (await feeHeadRepository.count(ctx.tenantId, [inArray(feeHeads.id, unique)])) === unique.length;
  },

  findById: (ctx, id) => feeHeadRepository.findById(ctx.tenantId, id)
};
