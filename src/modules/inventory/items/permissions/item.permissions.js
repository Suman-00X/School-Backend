import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { INVENTORY_MANAGERS, INVENTORY_READERS } from "../../shared/constants/inventory.permissions.js";

export const ITEM_PERMISSIONS = definePermissions("inventory.items", {
  manage: { roles: INVENTORY_MANAGERS, label: "Add and edit items and reorder levels" },
  read: { roles: INVENTORY_READERS, label: "View items and stock on hand" }
});
