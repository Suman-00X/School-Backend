import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { INVENTORY_READERS, STOCK_ADJUSTERS, STOCK_KEEPERS } from "../../shared/constants/inventory.permissions.js";

export const STOCK_PERMISSIONS = definePermissions("inventory.stock", {
  /* RECEIPT, ISSUE, RETURN */
  move: STOCK_KEEPERS,
  /* ADJUSTMENT (stock counts, damage, loss): additionally required for that type */
  adjust: STOCK_ADJUSTERS,
  read: INVENTORY_READERS
});
