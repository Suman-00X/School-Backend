import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { FINANCE_APPROVERS, FINANCE_READERS } from "../../shared/constants/finance.permissions.js";

export const FINANCE_SETTINGS_PERMISSIONS = definePermissions("finance.settings", {
  read: { roles: FINANCE_READERS, label: "View finance settings" },
  /* The refund approval limit decides what needs an administrator: administrators only */
  manage: { roles: FINANCE_APPROVERS, label: "Change finance settings (refund approval limit)" }
});
