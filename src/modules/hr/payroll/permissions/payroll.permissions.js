import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { EMPLOYEES, PAYROLL_MANAGERS } from "../../shared/constants/hr.permissions.js";

export const SALARY_COMPONENT_PERMISSIONS = definePermissions("hr.salaryComponents", {
  manage: PAYROLL_MANAGERS,
  read: PAYROLL_MANAGERS
});

export const EMPLOYEE_SALARY_PERMISSIONS = definePermissions("hr.employeeSalaries", {
  manage: PAYROLL_MANAGERS,
  read: PAYROLL_MANAGERS
});

export const PAYROLL_RUN_PERMISSIONS = definePermissions("hr.payrollRuns", {
  run: PAYROLL_MANAGERS,
  finalize: PAYROLL_MANAGERS,
  read: PAYROLL_MANAGERS
});

export const PAYSLIP_PERMISSIONS = definePermissions("hr.payslips", {
  read: PAYROLL_MANAGERS,
  /* /hr/me/payslips: own payslips of finalized runs */
  readOwn: EMPLOYEES
});
