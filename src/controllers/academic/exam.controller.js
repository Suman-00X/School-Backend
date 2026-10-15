import * as academicQueries from "../../queries/academic.queries.js";
import { successResponse, errorResponse } from "../../responses/index.js";
import * as academicValidator from "../../queries/academic.validators.js";

/* Exams */
export const createExam = async (req, res, next) => {
  try {
    const valid = await academicValidator.isSectionInAcademicYear(
      req.user.tenantId,
      exam.academicYearId,
      req.body.sectionId
    );
    if (!valid) throw new Error("Section not in exam academic year");

    const data = await academicQueries.createExam(
      req.user.tenantId,
      req.academicYearId,   // system year
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Exam created");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getExams = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getExams(
        req.user.tenantId,
        req.academicYearId,  // filter by year
        req.query
      )
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getExamById = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getExamById(
        req.user.tenantId,
        req.academicYearId,
        req.params.examId
      )
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const updateExam = async (req, res, next) => {
  try {
    const data = await academicQueries.updateExam(
      req.user.tenantId,
      req.academicYearId,
      req.params.examId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Exam updated");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Exam Structure */
export const createExamSectionSubjectMap = async (req, res, next) => {
  try {
    const validExam = await academicValidator.doesExamBelongToAcademicYear(
      req.user.tenantId,
      req.body.examId,
      req.body.academicYearId
    );
    if (!validExam) throw new Error("Exam does not belong to academic year");

    const data = await academicQueries.createExamSectionSubjectMap(
      req.user.tenantId,
      req.academicYearId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Exam structure created");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getExamStructure = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getExamStructure(
        req.user.tenantId,
        req.academicYearId,
        req.params.examId
      )
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};