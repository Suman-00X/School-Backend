import * as examQueries from "./exam.queries.js";
import { successResponse, errorResponse } from "../../common/responses/index.js";
import { notFound } from "../../common/utils/appError.util.js";
import { requireItems } from "../../common/utils/bulk.util.js";

/* Create (in the resolved academic year) */
export const createExam = async (req, res, next) => {
  try {
    const data = await examQueries.createExam(req.user.tenantId, req.academicYearId, req.body);
    res.locals.entityId = data.id;
    return successResponse(res, data, "Exam created", 201);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const createExamsBulk = async (req, res, next) => {
  try {
    const exams = requireItems(req.body.exams, "exams");
    return successResponse(
      res,
      await examQueries.createExamsBulk(req.user.tenantId, req.academicYearId, exams),
      "Exams created",
      201
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getExams = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await examQueries.getExams(req.user.tenantId, req.academicYearId, req.query)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getExamById = async (req, res, next) => {
  try {
    const data = await examQueries.getExamById(req.user.tenantId, req.params.examId);
    if (!data) throw notFound("Exam");
    return successResponse(res, data);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const updateExam = async (req, res, next) => {
  try {
    const data = await examQueries.updateExam(req.user.tenantId, req.params.examId, req.body);
    if (!data) throw notFound("Exam");
    res.locals.entityId = data.id;
    return successResponse(res, data, "Exam updated");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
