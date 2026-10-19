/* academics/academic-years: school years and which one is current */
export { default as academicYearRoutes } from "./routes/academicYear.routes.js";
export { academicYearService } from "./services/academicYear.service.js";
export { isWeeklyOff } from "./utils/weeklyOff.util.js";
export { resolveAcademicYear } from "../shared/middlewares/academicYear.middleware.js";
