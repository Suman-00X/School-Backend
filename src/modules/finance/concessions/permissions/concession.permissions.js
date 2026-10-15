import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { FINANCE_MANAGERS, FINANCE_READERS } from "../../shared/constants/finance.permissions.js";

export const CONCESSION_PERMISSIONS = definePermissions("finance.concessions", {
  manage: FINANCE_MANAGERS,
  read: FINANCE_READERS
});
