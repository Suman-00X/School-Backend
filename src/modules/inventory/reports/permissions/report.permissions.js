import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { INVENTORY_READERS } from "../../shared/constants/inventory.permissions.js";

export const REPORT_PERMISSIONS = definePermissions("inventory.reports", {
  read: INVENTORY_READERS
});
