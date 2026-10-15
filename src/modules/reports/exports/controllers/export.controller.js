import { sendTable } from "../../../../common/export/exporters.js";
import { exportService } from "../services/export.service.js";

/* Every export streams a CSV or Excel file */
const download = build => async (req, res) => {
  const table = await build(req);
  return sendTable(res, { ...table, format: req.query.format });
};

export const exportController = {
  students: download(req => exportService.students(req.context)),
  attendance: download(req => exportService.attendance(req.context, req.query)),
  feeCollections: download(req => exportService.feeCollections(req.context, req.query)),
  defaulters: download(req => exportService.defaulters(req.context)),
  results: download(req => exportService.results(req.context, req.query))
};
