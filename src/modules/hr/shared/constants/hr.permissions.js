import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

/* Role sets reused by every hr submodule's permissions */
/* HR has its own module administrator; the principal still decides leave (D-51) */
export const HR_MANAGERS = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HR_MANAGER];
export const ATTENDANCE_KEEPERS = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HR_MANAGER];
export const PAYROLL_MANAGERS = [ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.HR_MANAGER];
/* Cancel someone else's leave, or approved leave: the module's administrators */
export const LEAVE_CANCELLERS = [ROLES.ADMIN, ROLES.HR_MANAGER];
export const EMPLOYEES = ROLE_GROUPS.ALL_EMPLOYEES;
