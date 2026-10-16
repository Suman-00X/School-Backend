import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { INVENTORY_READERS, STOCK_ADJUSTERS, STOCK_KEEPERS } from "../../shared/constants/inventory.permissions.js";

export const STOCK_PERMISSIONS = definePermissions("inventory.stock", {
  /* RECEIPT, ISSUE, RETURN */
  move: { roles: STOCK_KEEPERS, label: "Receive, issue and take back stock" },
  /* ADJUSTMENT (stock counts, damage, loss): additionally required for that type.
     Approval-type: never given to an operator */
  adjust: { roles: STOCK_ADJUSTERS, ownerOnly: true, label: "Adjust stock (counts, damage, loss)" },
  read: { roles: INVENTORY_READERS, label: "View the stock ledger" }
});
