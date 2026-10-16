import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { INVENTORY_MANAGERS, INVENTORY_READERS } from "../../shared/constants/inventory.permissions.js";

export const VENDOR_PERMISSIONS = definePermissions("inventory.vendors", {
  manage: INVENTORY_MANAGERS,
  read: INVENTORY_READERS
});
