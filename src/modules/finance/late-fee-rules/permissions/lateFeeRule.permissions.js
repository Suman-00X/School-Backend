import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { FINANCE_MANAGERS, FINANCE_READERS } from "../../shared/constants/finance.permissions.js";

export const LATE_FEE_RULE_PERMISSIONS = definePermissions("finance.lateFeeRules", {
  manage: FINANCE_MANAGERS,
  read: FINANCE_READERS
});
