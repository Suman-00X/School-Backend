import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { EMPLOYEES, PAYROLL_MANAGERS } from "../../shared/constants/hr.permissions.js";

export const SALARY_COMPONENT_PERMISSIONS = definePermissions("hr.salaryComponents", {
  manage: { roles: PAYROLL_MANAGERS, label: "Define salary components" },
  read: { roles: PAYROLL_MANAGERS, label: "View salary components" }
});

export const EMPLOYEE_SALARY_PERMISSIONS = definePermissions("hr.employeeSalaries", {
  manage: { roles: PAYROLL_MANAGERS, label: "Set employees' salaries and bank details" },
  read: { roles: PAYROLL_MANAGERS, label: "View employees' salaries" }
});

export const PAYROLL_RUN_PERMISSIONS = definePermissions("hr.payrollRuns", {
  run: { roles: PAYROLL_MANAGERS, label: "Prepare and recalculate payroll runs" },
  /* Approval: never given to an operator */
  finalize: { roles: PAYROLL_MANAGERS, ownerOnly: true, label: "Finalize payroll runs" },
  read: { roles: PAYROLL_MANAGERS, label: "View payroll runs" }
});

export const PAYSLIP_PERMISSIONS = definePermissions("hr.payslips", {
  read: { roles: PAYROLL_MANAGERS, label: "View and print payslips" },
  /* /hr/me/payslips: own payslips of finalized runs */
  readOwn: { roles: EMPLOYEES, selfService: true, label: "View own payslips" }
});
