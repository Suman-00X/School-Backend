/* academics/attendance: student attendance taken once a day, forenoon and afternoon,
   or period by period (the same mode for the whole school, changing over time), and
   free periods nobody covers */
export { default as attendanceRoutes } from "./routes/attendance.routes.js";
export { attendanceService, attendancePolicyService, ATTENDANCE_RECORDED } from "./services/attendance.service.js";
export { attendanceModeService } from "./services/attendanceMode.service.js";
export { missingRegisterService } from "./services/missingRegisters.service.js";
export { dayOf, registerKey } from "./services/attendanceCalculation.service.js";
