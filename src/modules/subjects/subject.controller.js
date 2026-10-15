import * as subjectQueries from "./subject.queries.js";
import { successResponse, errorResponse } from "../../common/responses/index.js";
import { notFound } from "../../common/utils/appError.util.js";
import { requireItems } from "../../common/utils/bulk.util.js";

export const createSubject = async (req, res, next) => {
  try {
    const data = await subjectQueries.createSubject(req.user.tenantId, req.body);
    res.locals.entityId = data.id;
    return successResponse(res, data, "Subject created", 201);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const createSubjectsBulk = async (req, res, next) => {
  try {
    const subjects = requireItems(req.body.subjects, "subjects");
    return successResponse(
      res,
      await subjectQueries.createSubjectsBulk(req.user.tenantId, subjects),
      "Subjects created",
      201
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getSubjects = async (req, res, next) => {
  try {
    return successResponse(res, await subjectQueries.getSubjects(req.user.tenantId, req.query));
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getSubjectById = async (req, res, next) => {
  try {
    const data = await subjectQueries.getSubjectById(req.user.tenantId, req.params.subjectId);
    if (!data) throw notFound("Subject");
    return successResponse(res, data);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const updateSubject = async (req, res, next) => {
  try {
    const data = await subjectQueries.updateSubject(req.user.tenantId, req.params.subjectId, req.body);
    if (!data) throw notFound("Subject");
    res.locals.entityId = data.id;
    return successResponse(res, data, "Subject updated");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
