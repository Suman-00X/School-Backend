import * as academicQueries from "../../queries/academic.queries.js";
import { successResponse, errorResponse } from "../../responses/index.js";

/* Classes */
export const createClassesBulk = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.createClassesBulk(
        req.user.tenantId,
        req.academicYearId,
        req.body.classes
      ),
      "Classes created"
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Subjects (no academic year needed) */
export const createSubjectsBulk = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.createSubjectsBulk(req.user.tenantId, req.body.subjects),
      "Subjects created"
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Sections */
export const createSectionsBulk = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.createSectionsBulk(
        req.user.tenantId,
        req.academicYearId,
        req.body.sections
      ),
      "Sections created"
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Exams */
export const createExamsBulk = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.createExamsBulk(
        req.user.tenantId,
        req.academicYearId,
        req.body.exams
      ),
      "Exams created"
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Marks */
export const upsertMarksBulk = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.upsertMarksBulk(
        req.user.tenantId,
        req.academicYearId,
        req.body.marks
      ),
      "Marks uploaded"
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};