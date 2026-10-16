import { accepted, created, ok, paginated } from "../../../../common/http/responses.js";
import { studentImportJob } from "../jobs/studentImport.job.js";
import { studentImportService } from "../services/studentImport.service.js";

const location = (res, job) => {
  res.locals.entityId = job.id;
  res.setHeader("Location", `/api/v1/administration/imports/${job.id}`);
};

const mappingSummary = job => {
  const mapped = job.fields.filter(f => f.column).length;
  const missing = job.missingRequired.length;
  return `${mapped} of ${job.fields.length} fields matched to columns; ${
    missing ? `${missing} required field(s) still need a column` : "all required fields are mapped"
  }`;
};

export const importController = {
  /* 201: the file is stored; confirm the column mapping, then start */
  createStudents: async (req, res) => {
    const job = await studentImportService.upload(req.context, req.file, { ...req.query, ...req.body });
    location(res, job);
    return created(
      res,
      job,
      `${job.fileName}: ${job.totalRows} row(s), ${job.columns.length} column(s). ${mappingSummary(job)}. Review the mapping, then start the import.`
    );
  },

  updateMapping: async (req, res) => {
    const job = await studentImportService.updateMapping(req.context, req.params.importId, req.body.mapping);
    return ok(res, job, `Mapping updated: ${mappingSummary(job)}`);
  },

  /* 202 Accepted: the import runs in the background; poll Location for progress */
  start: async (req, res) => {
    const job = await studentImportService.start(req.context, req.params.importId, data =>
      studentImportJob.enqueue(data)
    );
    location(res, job);
    return accepted(res, job, `Import accepted: ${job.totalRows} row(s) queued`);
  },

  cancel: async (req, res) =>
    ok(res, await studentImportService.cancel(req.context, req.params.importId), "Import cancelled"),

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
