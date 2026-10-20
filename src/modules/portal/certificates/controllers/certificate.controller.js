import { sendFile } from "../../../../common/export/exporters.js";
import { ok, paginated } from "../../../../common/http/responses.js";
import { portalCertificateService } from "../services/certificate.service.js";

export const portalCertificateController = {
  list: async (req, res) =>
    paginated(
      res,
      await portalCertificateService.list(req.context, req.params.studentId, req.query),
      "Certificates retrieved successfully"
    ),

  document: async (req, res) =>
    ok(
      res,
      { html: await portalCertificateService.document(req.context, req.params.studentId, req.params.certificateId) },
      "Certificate retrieved successfully"
    ),

  pdf: async (req, res) =>
    sendFile(res, {
      ...(await portalCertificateService.pdf(req.context, req.params.studentId, req.params.certificateId)),
      format: "pdf"
    })
};
