import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLES } from "../../../../common/auth/roles.js";

/* The school's own gateway keys: administrators only */
export const PAYMENT_SETTINGS_PERMISSIONS = definePermissions("finance.paymentSettings", {
  read: [ROLES.ADMIN],
  manage: [ROLES.ADMIN]
});
