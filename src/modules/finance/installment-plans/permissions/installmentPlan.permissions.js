import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { FINANCE_MANAGERS, FINANCE_READERS } from "../../shared/constants/finance.permissions.js";

export const INSTALLMENT_PLAN_PERMISSIONS = definePermissions("finance.installmentPlans", {
  manage: FINANCE_MANAGERS,
  read: FINANCE_READERS,
  assign: FINANCE_MANAGERS
});
