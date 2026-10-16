import { sendTable } from "../../../../common/export/exporters.js";
import { ok } from "../../../../common/http/responses.js";
import { formatAmount, plural } from "../../shared/utils/circulation.util.js";
import { reportService } from "../services/report.service.js";

/* JSON by default; ?format=csv|xlsx downloads the same report as a file */
const report = (build, message) => async (req, res) => {
  const { data, table } = await build(req);
  if (req.query.format) return sendTable(res, { ...table, format: req.query.format });
  return ok(res, data, message(data));
};

export const reportController = {
  currentLoans: report(
    req => reportService.currentLoans(req.context),
    data => `${plural(data.count, "item")} on loan, ${data.overdue} overdue`
  ),
  overdue: report(
    req => reportService.overdue(req.context),
    data => `${plural(data.count, "overdue item")}; late fines so far ${formatAmount(data.finesAccrued)}`
  ),
  finesCollected: report(
    req => reportService.finesCollected(req.context, req.query),
    data => `${formatAmount(data.collected)} in library fines collected from ${data.from} to ${data.to}`
  ),
  finesOutstanding: report(
    req => reportService.finesOutstanding(req.context),
    data => `${formatAmount(data.total)} outstanding from ${plural(data.borrowers.length, "borrower")}`
  ),
  mostBorrowed: report(
    req => reportService.mostBorrowed(req.context, req.query),
    data => `Most borrowed titles from ${data.from} to ${data.to}`
  ),
  inactiveBorrowers: report(
    req => reportService.inactiveBorrowers(req.context, req.query),
    data => `${plural(data.count, "borrower")} with no loan since ${data.since}`
  ),
  acquisitions: report(
    req => reportService.acquisitions(req.context, req.query),
    data => `${plural(data.count, "copy", "copies")} acquired from ${data.from} to ${data.to}`
  )
};
