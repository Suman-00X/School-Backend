import * as academicQueries from "../../queries/academic.queries.js";
import { successResponse, errorResponse } from "../../responses/index.js";
import { notFound } from "../../utils/appError.util.js";

export const createClass = async (req, res, next) => {
  try {
    const data = await academicQueries.createClass(req.user.tenantId, req.body);
    res.locals.entityId = data._id;
    return successResponse(res, data, "Class created", 201);
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
    const data = await academicQueries.getClassById(req.user.tenantId, req.params.classId);
    if (!data) throw notFound("Class");
    return successResponse(res, data);
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
    if (!data) throw notFound("Class");
    res.locals.entityId = data._id;
    return successResponse(res, data, "Class updated");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
