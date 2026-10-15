import { paginated, ok } from "../../../../common/http/responses.js";
import { studentImportJob } from "../jobs/studentImport.job.js";
import { studentImportService } from "../services/studentImport.service.js";

export const importController = {
  /* 202 Accepted: the import runs in the background; poll Location for progress */
  createStudents: async (req, res) => {
    const job = await studentImportService.start(req.context, req.file, req.query, data =>
      studentImportJob.enqueue(data)
    );
    res.locals.entityId = job.id;
    res.setHeader("Location", `/api/v1/administration/imports/${job.id}`);
    return res.status(202).json({
      success: true,
      message: `Import accepted: ${job.totalRows} row(s) queued`,
      data: job
    });
  },

  list: async (req, res) =>
    paginated(res, await studentImportService.list(req.context, req.query), "Imports retrieved successfully"),

  getById: async (req, res) =>
    ok(res, await studentImportService.getById(req.context, req.params.importId), "Import retrieved successfully"),

  template: (req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="student-import-template.csv"');
    return res.send(studentImportService.template());
  }
};
