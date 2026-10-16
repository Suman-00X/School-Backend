import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { INVENTORY_MANAGERS, INVENTORY_READERS } from "../../shared/constants/inventory.permissions.js";

export const VENDOR_PERMISSIONS = definePermissions("inventory.vendors", {
  manage: { roles: INVENTORY_MANAGERS, label: "Add and edit vendors" },
  read: { roles: INVENTORY_READERS, label: "View vendors" }
});
