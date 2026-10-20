import { studentLeaveService } from "../../../academics/student-leaves/index.js";
import { studentAccess } from "../../shared/services/studentAccess.service.js";

export const portalLeaveService = {
  list: async (ctx, studentId, query) => {
    await studentAccess.assert(ctx, studentId);
    return studentLeaveService.forStudent(ctx, studentId, query);
  },

  apply: async (ctx, studentId, body) => {
    await studentAccess.assert(ctx, studentId);
    return studentLeaveService.apply(ctx, studentId, body);
  },

  cancel: async (ctx, studentId, requestId, body) => {
    await studentAccess.assert(ctx, studentId);
    return studentLeaveService.cancel(ctx, studentId, requestId, body);
  }
};
