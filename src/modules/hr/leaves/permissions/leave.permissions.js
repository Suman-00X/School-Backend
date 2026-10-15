import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { EMPLOYEES, HR_MANAGERS } from "../../shared/constants/hr.permissions.js";

export const LEAVE_TYPE_PERMISSIONS = definePermissions("hr.leaveTypes", {
  manage: HR_MANAGERS,
  read: EMPLOYEES
});

/* Cancelling is further limited to the applicant or an ADMIN (service) */
export const LEAVE_REQUEST_PERMISSIONS = definePermissions("hr.leaveRequests", {
  apply: EMPLOYEES,
  decide: HR_MANAGERS,
  cancel: EMPLOYEES,
  read: HR_MANAGERS,
  readOwn: EMPLOYEES
});

export const LEAVE_BALANCE_PERMISSIONS = definePermissions("hr.leaveBalances", {
  read: HR_MANAGERS,
  readOwn: EMPLOYEES
});
