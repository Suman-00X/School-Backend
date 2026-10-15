import * as academicQueries from "../../queries/academic.queries.js";
import { successResponse, errorResponse } from "../../responses/index.js";
import * as academicValidator from "../../queries/academic.validators.js";

/* Map student to section (promotion / transfer / new admission) */
export const mapStudentToSection = async (req, res, next) => {
  try {
    const exists = await academicValidator.isStudentAlreadyAdmitted(
      req.user.tenantId,
      req.body.academicYearId,
      req.body.studentId
    );
    if (exists) throw new Error("Student already mapped for this academic year");

    const data = await academicQueries.mapStudentToSection(
      req.user.tenantId,
      req.academicYearId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Student mapped to section");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Get students of section (ONLY CURRENT YEAR) */
export const getStudentsBySection = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getStudentsBySection(
        req.user.tenantId,
        req.academicYearId,
        req.params.sectionId
      )
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Update mapping (change section / status) */
export const updateStudentSectionMap = async (req, res, next) => {
  try {
    const data = await academicQueries.updateStudentSectionMap(
      req.user.tenantId,
      req.academicYearId,
      req.params.mapId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Student section updated");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};