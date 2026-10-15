import * as academicQueries from "../../queries/academic.queries.js";
import { successResponse, errorResponse } from "../../responses/index.js";

export const createClass = async (req, res, next) => {
  try {
    const data = await academicQueries.createClass(req.user.tenantId, req.body);
    res.locals.entityId = data._id;
    return successResponse(res, data, "Class created");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getClasses = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getClasses(req.user.tenantId, req.query)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getClassById = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getClassById(req.user.tenantId, req.params.classId)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const updateClass = async (req, res, next) => {
  try {
    const data = await academicQueries.updateClass(
      req.user.tenantId,
      req.params.classId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Class updated");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};