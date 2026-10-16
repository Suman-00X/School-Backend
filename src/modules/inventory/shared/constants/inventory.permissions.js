import { ROLES } from "../../../../common/auth/roles.js";

/* Role sets reused by every inventory submodule's permissions */
/* The store is run by its own module administrator (D-51) */
export const INVENTORY_MANAGERS = [ROLES.ADMIN, ROLES.INVENTORY_MANAGER];
export const STOCK_KEEPERS = [ROLES.ADMIN, ROLES.INVENTORY_MANAGER];
export const STOCK_ADJUSTERS = [ROLES.ADMIN, ROLES.INVENTORY_MANAGER];
export const INVENTORY_READERS = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.ACCOUNTANT, ROLES.INVENTORY_MANAGER];
