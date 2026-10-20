import { sendTable } from "../../../../common/export/exporters.js";
import { ok } from "../../../../common/http/responses.js";
import { governmentExportService } from "../services/governmentExport.service.js";

const download = build => async (req, res) => sendTable(res, { ...(await build(req)), format: req.query.format });

export const governmentExportController = {
  readiness: async (req, res) => {
    const readiness = await governmentExportService.readiness(req.context, req.query);
    return ok(
      res,
      readiness,
      `${readiness.ready.udise} of ${readiness.students} students are ready for UDISE+, ${readiness.ready.apaar} for APAAR`
    );
  },
  udise: download(req => governmentExportService.udise(req.context, req.query)),
  apaar: download(req => governmentExportService.apaar(req.context, req.query))
};
