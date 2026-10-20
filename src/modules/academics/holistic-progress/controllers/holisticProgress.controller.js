import { sendFile } from "../../../../common/export/exporters.js";
import { ok } from "../../../../common/http/responses.js";
import { holisticProgressPdfService } from "../services/holisticProgressPdf.service.js";
import { holisticProgressService } from "../services/holisticProgress.service.js";

export const holisticProgressController = {
  section: async (req, res) => {
    const sheet = await holisticProgressService.forSection(req.context, req.params);
    return ok(
      res,
      sheet,
      `Holistic Progress Cards of ${sheet.section.name}: ${sheet.summary.complete} of ${sheet.summary.students} complete`
    );
  },

  student: async (req, res) =>
    ok(res, await holisticProgressService.forStudent(req.context, req.params), "Holistic Progress Card retrieved successfully"),

  save: async (req, res) =>
    ok(res, await holisticProgressService.save(req.context, req.params, req.body), "Holistic Progress Card saved successfully"),

  pdf: async (req, res) => {
    const { buffer, fileName } = await holisticProgressPdfService.render(req.context, req.params);
    return sendFile(res, { buffer, fileName, format: "pdf" });
  }
};
