import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { INVENTORY_MANAGERS, INVENTORY_READERS } from "../../shared/constants/inventory.permissions.js";

export const CATEGORY_PERMISSIONS = definePermissions("inventory.categories", {
  manage: { roles: INVENTORY_MANAGERS, label: "Add and edit item categories" },
  read: { roles: INVENTORY_READERS, label: "View item categories" }
});
