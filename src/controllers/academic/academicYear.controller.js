import * as academicQueries from "../../queries/academic.queries.js";
import { successResponse, errorResponse } from "../../responses/index.js";

export const createAcademicYear = async (req, res, next) => {
  try {
    const data = await academicQueries.createAcademicYear(req.user.tenantId, req.body);
    res.locals.entityId = data._id;
    return successResponse(res, data, "Academic year created");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getAcademicYears = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getAcademicYears(req.user.tenantId, req.query)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getAcademicYearById = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getAcademicYearById(req.user.tenantId, req.params.academicYearId)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const updateAcademicYear = async (req, res, next) => {
  try {
    const data = await academicQueries.updateAcademicYear(
      req.user.tenantId,
      req.params.academicYearId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Academic year updated");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
