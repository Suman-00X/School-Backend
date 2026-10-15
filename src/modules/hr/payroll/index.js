/* hr/payroll: salary components, employee salary revisions, monthly payroll runs and payslips */
export { default as salaryComponentRoutes } from "./routes/salaryComponent.routes.js";
export { default as employeeSalaryRoutes } from "./routes/employeeSalary.routes.js";
export { default as payrollRunRoutes } from "./routes/payrollRun.routes.js";
export { myPayslipRoutes, payslipRoutes } from "./routes/payslip.routes.js";
export { payrollRunService } from "./services/payrollRun.service.js";
export { payslipService } from "./services/payslip.service.js";
