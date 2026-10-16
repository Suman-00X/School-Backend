import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { stockController as controller } from "../controllers/stock.controller.js";
import { STOCK_PERMISSIONS as can } from "../permissions/stock.permissions.js";
import { stockValidators as rules } from "../validators/stock.validator.js";

/* Adjustments need the stricter permission (it is also what the audit trail records) */
const adjustGuard = authorize(can.adjust);
const guardAdjustments = (req, res, next) => (req.body.type === "ADJUSTMENT" ? adjustGuard(req, res, next) : next());

/* /api/v1/inventory/items/:itemId/movements (an item's ledger) */
export const itemMovementRoutes = createRouter();
itemMovementRoutes.post(
  "/:itemId/movements",
  authorize(can.move),
  validate(rules.record),
  guardAdjustments,
  controller.record
);
itemMovementRoutes.get("/:itemId/movements", authorize(can.read), validate(rules.itemLedger), controller.itemLedger);

/* /api/v1/inventory/movements (every item) */
export const movementRoutes = createRouter();
movementRoutes.get("/", authorize(can.read), validate(rules.list), controller.list);
movementRoutes.get("/:movementId", authorize(can.read), validate(rules.getById), controller.getById);
