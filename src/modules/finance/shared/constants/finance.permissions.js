import { ROLES } from "../../../../common/auth/roles.js";

/* Role sets reused by every finance submodule's permissions */
export const FINANCE_MANAGERS = [ROLES.ADMIN, ROLES.ACCOUNTANT];
export const FEE_COLLECTORS = [ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.STAFF];
export const FINANCE_READERS = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.ACCOUNTANT, ROLES.STAFF];
/* The books (general ledger): the head of school reads them too, office staff do not */
export const LEDGER_READERS = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.ACCOUNTANT];
/* Only an administrator approves money going out (maker-checker) */
export const FINANCE_APPROVERS = [ROLES.ADMIN];
