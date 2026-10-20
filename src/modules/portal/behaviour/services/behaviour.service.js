import { behaviourRemarkService } from "../../../academics/behaviour-remarks/index.js";
import { studentAccess } from "../../shared/services/studentAccess.service.js";

export const portalBehaviourService = {
  list: async (ctx, studentId, query) => {
    await studentAccess.assert(ctx, studentId);
    return behaviourRemarkService.forStudent(ctx, studentId, query);
  },

  summary: async (ctx, studentId) => {
    await studentAccess.assert(ctx, studentId);
    return behaviourRemarkService.summaryForStudent(ctx, studentId);
  },

  acknowledge: async (ctx, studentId, remarkId) => {
    await studentAccess.assert(ctx, studentId);
    return behaviourRemarkService.acknowledge(ctx, studentId, remarkId);
  }
};
