import * as academicYearQueries from "./academicYear.queries.js";
import { successResponse, errorResponse } from "../../common/responses/index.js";
import { notFound } from "../../common/utils/appError.util.js";

export const createAcademicYear = async (req, res, next) => {
  try {
    const data = await academicYearQueries.createAcademicYear(req.user.tenantId, req.body);
    res.locals.entityId = data.id;
    return successResponse(res, data, "Academic year created", 201);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getAcademicYears = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicYearQueries.getAcademicYears(req.user.tenantId, req.query)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getAcademicYearById = async (req, res, next) => {
  try {
    const data = await academicYearQueries.getAcademicYearById(
      req.user.tenantId,
      req.params.academicYearId
    );
    if (!data) throw notFound("Academic year");
    return successResponse(res, data);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const updateAcademicYear = async (req, res, next) => {
  try {
    const data = await academicYearQueries.updateAcademicYear(
      req.user.tenantId,
      req.params.academicYearId,
      req.body
    );
    if (!data) throw notFound("Academic year");
    res.locals.entityId = data.id;
    return successResponse(res, data, "Academic year updated");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
