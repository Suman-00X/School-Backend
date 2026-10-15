import AcademicYear from "../models/academic-db/AcademicYear.js";

export const academicYearMiddleware = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Unauthorized" });

    // future ready: allow override from header
    const headerYear = req.headers["x-academic-year-id"];

    let academicYear;

    if (headerYear) {
      academicYear = await AcademicYear.findOne({
        _id: headerYear,
        tenantId,
        isActive: true
      }).lean();
    } else {
      academicYear = await AcademicYear.findOne({
        tenantId,
        isCurrent: true,
        isActive: true
      }).lean();
    }

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        message: "No active academic year configured"
      });
    }

    req.academicYearId = academicYear._id;
    req.academicYear = academicYear;

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Academic year resolution failed"
    });
  }
};
