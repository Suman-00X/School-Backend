import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { FINANCE_MANAGERS, FINANCE_READERS } from "../../shared/constants/finance.permissions.js";

export const CREDIT_PERMISSIONS = definePermissions("finance.credits", {
  read: FINANCE_READERS,
  apply: FINANCE_MANAGERS
});
