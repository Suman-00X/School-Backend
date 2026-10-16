import { created, ok, paginated } from "../../../../common/http/responses.js";
import { plural } from "../../shared/utils/circulation.util.js";
import { stockCheckService } from "../services/stockCheck.service.js";

export const stockCheckController = {
  start: async (req, res) => {
    const check = await stockCheckService.start(req.context, req.body);
    return created(
      res,
      check,
      `Stock check "${check.title}" started: ${plural(check.summary.expected, "copy", "copies")} to scan`
    );
  },

  list: async (req, res) =>
    paginated(res, await stockCheckService.list(req.context, req.query), "Stock checks retrieved successfully"),

  getById: async (req, res) =>
    ok(
      res,
      await stockCheckService.getById(req.context, req.params.stockCheckId),
      "Stock check retrieved successfully"
    ),

  scan: async (req, res) => {
    const { results, summary } = await stockCheckService.scan(req.context, req.params.stockCheckId, req.body);
    const recorded = results.filter(r => !r.repeated).length;
    return created(
      res,
      { results, summary },
      `${plural(recorded, "scan")} recorded. Found ${summary.found} of ${summary.expected}; ` +
        `${summary.missing} not scanned yet, ${summary.unexpected} unexpected, ${summary.unknown} unknown`
    );
  },

  missing: async (req, res) =>
    paginated(
      res,
      await stockCheckService.missing(req.context, req.params.stockCheckId, req.query),
      "Missing copies retrieved successfully"
    ),

  unexpected: async (req, res) =>
    paginated(
      res,
      await stockCheckService.unexpected(req.context, req.params.stockCheckId, req.query),
      "Unexpected scans retrieved successfully"
    ),

  close: async (req, res) => {
    const check = await stockCheckService.close(req.context, req.params.stockCheckId);
    const { found, expected, missing } = check.summary;
    return ok(
      res,
      check,
      `Stock check "${check.title}" closed: ${found} of ${expected} found, ${plural(missing, "copy", "copies")} marked missing`
    );
  }
};
