import { ROLES, ROLE_GROUPS } from "../../../../common/auth/roles.js";

/* Role sets reused by every inventory submodule's permissions */
export const INVENTORY_MANAGERS = [ROLES.ADMIN, ROLES.STAFF];
export const STOCK_KEEPERS = [ROLES.ADMIN, ROLES.STAFF];
export const STOCK_ADJUSTERS = [ROLES.ADMIN];
export const INVENTORY_READERS = ROLE_GROUPS.STAFF_ROLES;
