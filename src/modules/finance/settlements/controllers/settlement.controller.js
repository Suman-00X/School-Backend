import { ok, paginated } from "../../../../common/http/responses.js";
import { settlementService } from "../services/settlement.service.js";

export const settlementController = {
  list: async (req, res) =>
    paginated(res, await settlementService.list(req.context, req.query), "Settlements retrieved successfully"),

  import: async (req, res) => {
    const result = await settlementService.importRange(req.context, req.body);
    return ok(
      res,
      result,
      result.imported
        ? `${result.imported} settlement${result.imported === 1 ? "" : "s"} imported and posted to the ledger`
        : result.found
          ? "No new settlements: every payout in this period is already imported"
          : "No settlements were paid out in this period"
    );
  }
};
