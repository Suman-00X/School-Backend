import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { INVENTORY_MANAGERS, INVENTORY_READERS } from "../../shared/constants/inventory.permissions.js";

export const ITEM_PERMISSIONS = definePermissions("inventory.items", {
  manage: INVENTORY_MANAGERS,
  read: INVENTORY_READERS
});
