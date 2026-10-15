import * as academicQueries from "../../queries/academic.queries.js";
import { successResponse, errorResponse } from "../../responses/index.js";

export const createSubject = async (req, res, next) => {
  try {
    const data = await academicQueries.createSubject(req.user.tenantId, req.body);
    res.locals.entityId = data._id;
    return successResponse(res, data, "Subject created");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getSubjects = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getSubjects(req.user.tenantId, req.query)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getSubjectById = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getSubjectById(req.user.tenantId, req.params.subjectId)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const updateSubject = async (req, res, next) => {
  try {
    const data = await academicQueries.updateSubject(
      req.user.tenantId,
      req.params.subjectId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Subject updated");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};