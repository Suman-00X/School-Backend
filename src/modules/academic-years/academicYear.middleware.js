import { isUuid } from "../../common/utils/validation.util.js";
import * as academicYearQueries from "./academicYear.queries.js";

/* Resolves req.academicYearId: the X-Academic-Year-Id header if sent,
   otherwise the tenant's current academic year */
export const academicYearMiddleware = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const headerYear = req.headers["x-academic-year-id"];

    if (headerYear && !isUuid(headerYear)) {
      return res.status(400).json({
        success: false,
        message: "Invalid X-Academic-Year-Id header"
      });
    }

    const academicYear = headerYear
      ? await academicYearQueries.getAcademicYearById(tenantId, headerYear)
      : await academicYearQueries.getCurrentAcademicYear(tenantId);

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        message: headerYear
          ? "Academic year not found"
          : "No current academic year configured"
      });
    }

    req.academicYearId = academicYear.id;
    req.academicYear = academicYear;

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Academic year resolution failed"
    });
  }
};
