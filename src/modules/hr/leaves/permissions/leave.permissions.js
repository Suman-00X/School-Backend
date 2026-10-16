import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { EMPLOYEES, HR_MANAGERS, LEAVE_CANCELLERS } from "../../shared/constants/hr.permissions.js";

export const LEAVE_TYPE_PERMISSIONS = definePermissions("hr.leaveTypes", {
  manage: { roles: HR_MANAGERS, label: "Define leave types and quotas" },
  read: { roles: EMPLOYEES, label: "View leave types" }
});

export const LEAVE_REQUEST_PERMISSIONS = definePermissions("hr.leaveRequests", {
  apply: { roles: EMPLOYEES, selfService: true, label: "Apply for own leave" },
  /* Approval: never given to an operator */
  decide: { roles: HR_MANAGERS, ownerOnly: true, label: "Approve or reject leave requests" },
  /* The route lets any employee in; the service limits it to the applicant or cancelAny */
  cancel: { roles: EMPLOYEES, selfService: true, label: "Cancel own pending leave" },
  cancelAny: { roles: LEAVE_CANCELLERS, ownerOnly: true, label: "Cancel anyone's leave, approved leave included" },
  read: { roles: HR_MANAGERS, label: "View every leave request" },
  readOwn: { roles: EMPLOYEES, selfService: true, label: "View own leave requests" }
});

export const LEAVE_BALANCE_PERMISSIONS = definePermissions("hr.leaveBalances", {
  read: { roles: HR_MANAGERS, label: "View employees' leave balances" },
  readOwn: { roles: EMPLOYEES, selfService: true, label: "View own leave balances" }
});
