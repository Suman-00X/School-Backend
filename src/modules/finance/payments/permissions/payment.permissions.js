import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { FEE_COLLECTORS, FINANCE_READERS } from "../../shared/constants/finance.permissions.js";

export const PAYMENT_PERMISSIONS = definePermissions("finance.payments", {
  collect: FEE_COLLECTORS,
  read: FINANCE_READERS
});
