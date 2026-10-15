import { ROLES } from "../../../../common/auth/roles.js";

/* Role sets reused by every finance submodule's permissions */
export const FINANCE_MANAGERS = [ROLES.ADMIN, ROLES.ACCOUNTANT];
export const FEE_COLLECTORS = [ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.STAFF];
export const FINANCE_READERS = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.ACCOUNTANT, ROLES.STAFF];
