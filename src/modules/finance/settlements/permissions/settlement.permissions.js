import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { FINANCE_MANAGERS, LEDGER_READERS } from "../../shared/constants/finance.permissions.js";

export const SETTLEMENT_PERMISSIONS = definePermissions("finance.settlements", {
  read: { roles: LEDGER_READERS, label: "View payment gateway settlements" },
  import: { roles: FINANCE_MANAGERS, label: "Import payment gateway settlements" }
});
