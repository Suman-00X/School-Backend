import { eq } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { conflict, notFound } from "../../../../common/http/errors.js";
import { leaveRequests } from "../models/leave.schema.js";
import { leaveRequestRepository, leaveTypeRepository } from "../repositories/leave.repository.js";

const base = createCrudService(leaveTypeRepository, { entity: "Leave type" });

export const leaveTypeService = {
  ...base,

  /* Pending requests must be decided or cancelled first */
  remove: async (ctx, leaveTypeId) => {
    const type = await base.getById(ctx, leaveTypeId);
    const pending = await leaveRequestRepository.count(ctx.tenantId, [
      eq(leaveRequests.leaveTypeId, leaveTypeId),
      eq(leaveRequests.status, "PENDING")
    ]);
    if (pending) {
      throw conflict(`${type.name} has ${pending} pending request(s); decide or cancel them before removing it`);
    }
    const removed = await leaveTypeRepository.softDelete(ctx.tenantId, leaveTypeId);
    if (!removed) throw notFound("Leave type");
    return removed;
  },

  /* For other submodules */
  findById: (ctx, leaveTypeId, options) => leaveTypeRepository.findById(ctx.tenantId, leaveTypeId, options),
  findAll: ctx => leaveTypeRepository.findMany(ctx.tenantId)
};
