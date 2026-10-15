import { ROLE_GROUPS } from "../../../../common/auth/roles.js";

/* Enum values used by the hr module's tables and validators (single source) */

/* Accounts that are employees of the school */
export const EMPLOYEE_ROLES = ROLE_GROUPS.ALL_EMPLOYEES;

export const STAFF_ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "ON_DUTY"];
/* Statuses that can carry check-in / check-out times */
export const TIMED_ATTENDANCE_STATUSES = ["PRESENT", "HALF_DAY", "ON_DUTY"];

export const LEAVE_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];
/* Requests that hold days (block overlaps, count against the quota) */
export const OPEN_LEAVE_STATUSES = ["PENDING", "APPROVED"];
export const LEAVE_DECISIONS = ["APPROVED", "REJECTED"];

export const SALARY_COMPONENT_KINDS = ["EARNING", "DEDUCTION"];
export const SALARY_CALCULATIONS = ["FIXED", "PERCENT_OF_BASIC"];

export const PAYROLL_RUN_STATUSES = ["DRAFT", "FINALIZED"];
