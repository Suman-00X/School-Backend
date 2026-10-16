import { sendTable } from "../../../../common/export/exporters.js";
import { ok } from "../../../../common/http/responses.js";
import { reportService } from "../services/report.service.js";

/* JSON by default; ?format=csv|xlsx downloads the same report as a file */
const report = (build, message) => async (req, res) => {
  const { data, table } = await build(req);
  if (req.query.format) return sendTable(res, { ...table, format: req.query.format });
  return ok(res, data, typeof message === "function" ? message(data) : message);
};

export const reportController = {
  lowStock: report(
    req => reportService.lowStock(req.context),
    data => `${data.items.length} item${data.items.length === 1 ? " is" : "s are"} at or below the reorder level`
  ),
  valuation: report(req => reportService.valuation(req.context), "Stock valuation retrieved successfully"),
  consumption: report(
    req => reportService.consumption(req.context, req.query),
    "Stock consumption retrieved successfully"
  )
};
