import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { FINANCE_MANAGERS, FINANCE_READERS } from "../../shared/constants/finance.permissions.js";

export const FEE_HEAD_PERMISSIONS = definePermissions("finance.feeHeads", {
  manage: FINANCE_MANAGERS,
  read: FINANCE_READERS
});
