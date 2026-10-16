import { created, ok, paginated } from "../../../../common/http/responses.js";
import { formatQuantity } from "../../shared/utils/stockMath.util.js";
import { stockService } from "../services/stock.service.js";

const fullName = user => (user ? `${user.firstName} ${user.lastName}`.trim() : null);

/* "Issued 2 PCS of Whiteboard marker to Science lab. 13 PCS left (STK-000004)" */
const describe = m => {
  const { item } = m;
  const amount = formatQuantity(Math.abs(m.quantityChange), item.unit);
  const balance = formatQuantity(m.balanceAfter, item.unit);
  const who = fullName(m.issuedToUser) ?? m.issuedTo;
  const lead = {
    RECEIPT: `Received ${amount} of ${item.name}${m.vendor ? ` from ${m.vendor.name}` : ""}`,
    ISSUE: `Issued ${amount} of ${item.name}${who ? ` to ${who}` : ""}`,
    RETURN: `Returned ${amount} of ${item.name}${who ? ` from ${who}` : ""}`,
    ADJUSTMENT: `Adjusted ${item.name} by ${m.quantityChange > 0 ? "+" : "-"}${amount}`
  }[m.type];
  return `${lead}. ${balance} in stock (${m.movementNumber})`;
};

export const stockController = {
  record: async (req, res) => {
    const movement = await stockService.record(req.context, req.params.itemId, req.body);
    return created(res, movement, describe(movement));
  },

  itemLedger: async (req, res) =>
    paginated(
      res,
      await stockService.itemLedger(req.context, req.params.itemId, req.query),
      "Stock ledger retrieved successfully"
    ),

  list: async (req, res) =>
    paginated(res, await stockService.list(req.context, req.query), "Stock movements retrieved successfully"),

  getById: async (req, res) =>
    ok(res, await stockService.getById(req.context, req.params.movementId), "Stock movement retrieved successfully")
};
