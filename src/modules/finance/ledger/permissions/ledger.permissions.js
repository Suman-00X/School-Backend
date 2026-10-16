import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { FINANCE_MANAGERS, LEDGER_READERS } from "../../shared/constants/finance.permissions.js";

export const LEDGER_PERMISSIONS = definePermissions("finance.ledger", {
  read: LEDGER_READERS,
  manageAccounts: FINANCE_MANAGERS,
  /* Manual journal entries (adjustments) and their reversals */
  post: FINANCE_MANAGERS
});
