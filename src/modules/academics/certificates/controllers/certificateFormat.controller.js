import { sendFile } from "../../../../common/export/exporters.js";
import { created, ok } from "../../../../common/http/responses.js";
import { certificateFormatService } from "../services/certificateFormat.service.js";

const typeOf = req => req.params.type;

export const certificateFormatController = {
  list: async (req, res) =>
    ok(res, await certificateFormatService.listCurrent(req.context), "Certificate formats retrieved successfully"),

  current: async (req, res) =>
    ok(
      res,
      await certificateFormatService.currentFull(req.context, typeOf(req)),
      "Certificate format retrieved successfully"
    ),

  versions: async (req, res) =>
    ok(
      res,
      await certificateFormatService.versions(req.context, typeOf(req)),
      "Format versions retrieved successfully"
    ),

  version: async (req, res) =>
    ok(
      res,
      await certificateFormatService.getVersion(req.context, typeOf(req), req.params.version),
      "Format version retrieved successfully"
    ),

  save: async (req, res) => {
    const saved = await certificateFormatService.save(req.context, typeOf(req), req.body);
    return created(res, saved, `Version ${saved.version} of the format saved; new certificates use it`);
  },

  restore: async (req, res) => {
    const saved = await certificateFormatService.restore(req.context, typeOf(req), req.params.version);
    return created(res, saved, `Version ${req.params.version} restored as version ${saved.version}`);
  },

  /* Previews read only: left out of the audit trail */
  preview: async (req, res) => {
    res.locals.skipAudit = true;
    return ok(
      res,
      { html: await certificateFormatService.preview(req.context, typeOf(req), req.body) },
      "Preview ready"
    );
  },

  previewPdf: async (req, res) => {
    res.locals.skipAudit = true;
    return sendFile(res, {
      buffer: await certificateFormatService.preview(req.context, typeOf(req), req.body, { pdf: true }),
      fileName: `${typeOf(req).toLowerCase()}-format-preview`,
      format: "pdf"
    });
  }
};
