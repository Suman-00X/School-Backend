import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

/* Role sets reused by every hr submodule's permissions */
export const HR_MANAGERS = ROLE_GROUPS.MANAGEMENT;
export const ATTENDANCE_KEEPERS = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF];
export const PAYROLL_MANAGERS = [ROLES.ADMIN, ROLES.ACCOUNTANT];
export const EMPLOYEES = ROLE_GROUPS.ALL_EMPLOYEES;
