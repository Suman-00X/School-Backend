import { createRouter } from "../../common/http/router.js";
import { myAttendanceRoutes, staffAttendanceRoutes } from "./staff-attendance/index.js";
import { leaveBalanceRoutes, leaveRequestRoutes, leaveTypeRoutes, myLeaveRoutes } from "./leaves/index.js";
import {
  employeeSalaryRoutes,
  myPayslipRoutes,
  payrollRunRoutes,
  payslipRoutes,
  salaryComponentRoutes
} from "./payroll/index.js";

/* HR module, mounted at /api/v1/hr */
const router = createRouter();

router.use("/staff-attendance", staffAttendanceRoutes);
router.use("/leave-types", leaveTypeRoutes);
router.use("/leave-requests", leaveRequestRoutes);
router.use("/leave-balances", leaveBalanceRoutes);
router.use("/salary-components", salaryComponentRoutes);
router.use("/employee-salaries", employeeSalaryRoutes);
router.use("/payroll-runs", payrollRunRoutes);
router.use("/payslips", payslipRoutes);

/* Self-service for every employee: /hr/me/attendance, /leave-requests, /leave-balances, /payslips */
router.use("/me", myAttendanceRoutes);
router.use("/me", myLeaveRoutes);
router.use("/me", myPayslipRoutes);

export default router;
