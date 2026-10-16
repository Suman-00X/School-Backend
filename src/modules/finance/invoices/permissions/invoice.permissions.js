import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { FINANCE_MANAGERS, FINANCE_READERS } from "../../shared/constants/finance.permissions.js";

export const INVOICE_PERMISSIONS = definePermissions("finance.invoices", {
  issue: FINANCE_MANAGERS,
  cancel: FINANCE_MANAGERS,
  waiveLateFee: FINANCE_MANAGERS,
  read: FINANCE_READERS
});
