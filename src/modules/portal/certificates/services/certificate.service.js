import { certificateService } from "../../../academics/certificates/index.js";
import { studentAccess } from "../../shared/services/studentAccess.service.js";

export const portalCertificateService = {
  list: async (ctx, studentId, query) => {
    await studentAccess.assert(ctx, studentId);
    return certificateService.forStudent(ctx, studentId, query);
  },

  document: async (ctx, studentId, certificateId) => {
    await studentAccess.assert(ctx, studentId);
    return certificateService.documentForStudent(ctx, studentId, certificateId);
  },

  pdf: async (ctx, studentId, certificateId) => {
    await studentAccess.assert(ctx, studentId);
    return certificateService.pdfForStudent(ctx, studentId, certificateId);
  }
};
