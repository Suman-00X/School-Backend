import { sendFile } from "../../../../common/export/exporters.js";
import { created, ok, paginated } from "../../../../common/http/responses.js";
import { CERTIFICATE_TYPE_INFO, CERTIFICATE_TYPES } from "../constants/certificate.constants.js";
import { placeholderGroupsOf } from "../services/certificateData.service.js";
import { certificateService } from "../services/certificate.service.js";

export const certificateController = {
  catalog: (req, res) =>
    ok(
      res,
      {
        types: CERTIFICATE_TYPES.map(type => {
          const { label, prefix, description, inputs } = CERTIFICATE_TYPE_INFO[type];
          return { type, label, prefix, description, inputs, placeholders: placeholderGroupsOf(type) };
        })
      },
      "Certificate types retrieved successfully"
    ),

  list: async (req, res) =>
    paginated(res, await certificateService.list(req.context, req.query), "Certificates retrieved successfully"),

  draft: async (req, res) =>
    ok(res, await certificateService.draft(req.context, req.query), "Certificate details retrieved successfully"),

  /* Reads only: left out of the audit trail */
  preview: async (req, res) => {
    res.locals.skipAudit = true;
    return ok(res, { html: await certificateService.preview(req.context, req.body) }, "Preview ready");
  },

  issue: async (req, res) => {
    const certificate = await certificateService.issue(req.context, req.body);
    const left = certificate.markedLeft ? "; the student is marked as left" : "";
    return created(
      res,
      certificate,
      `${certificate.label} ${certificate.serialNumber} issued to ${certificate.student.name}${left}`
    );
  },

  get: async (req, res) =>
    ok(res, await certificateService.get(req.context, req.params.certificateId), "Certificate retrieved successfully"),

  document: async (req, res) =>
    ok(
      res,
      { html: await certificateService.document(req.context, req.params.certificateId) },
      "Certificate retrieved successfully"
    ),

  pdf: async (req, res) =>
    sendFile(res, { ...(await certificateService.pdf(req.context, req.params.certificateId)), format: "pdf" }),

  cancel: async (req, res) => {
    const certificate = await certificateService.cancel(req.context, req.params.certificateId, req.body);
    return ok(res, certificate, `${certificate.label} ${certificate.serialNumber} cancelled`);
  }
};
