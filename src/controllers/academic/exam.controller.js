import Subject from "../../models/academic-db/Subject.js";
import * as academicQueries from "../../queries/academic.queries.js";
import * as academicValidator from "../../queries/academic.validators.js";
import { getSectionContext } from "../../services/academicContext.service.js";
import { generateExamSectionSubjectDisplay } from "../../services/idFormat.service.js";
import { successResponse, errorResponse } from "../../responses/index.js";
import { badRequest, notFound } from "../../utils/appError.util.js";

/* Exams */
export const createExam = async (req, res, next) => {
  try {
    const data = await academicQueries.createExam(
      req.user.tenantId,
      req.academicYearId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Exam created", 201);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getExams = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getExams(req.user.tenantId, req.academicYearId, req.query)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getExamById = async (req, res, next) => {
  try {
    const data = await academicQueries.getExamById(req.user.tenantId, req.params.examId);
    if (!data) throw notFound("Exam");
    return successResponse(res, data);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const updateExam = async (req, res, next) => {
  try {
    const data = await academicQueries.updateExam(
      req.user.tenantId,
      req.params.examId,
      req.body
    );
    if (!data) throw notFound("Exam");
    res.locals.entityId = data._id;
    return successResponse(res, data, "Exam updated");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Exam Structure: which subjects a section sits for in an exam */
export const createExamSectionSubjectMap = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const academicYearId = req.academicYearId;
    const { examId, sectionId, subjectId, examDate, maxMarks, passMarks, description } = req.body;

    const exam = await academicQueries.getExamById(tenantId, examId);
    if (!exam || String(exam.academicYearId) !== String(academicYearId)) {
      throw badRequest("Exam does not belong to academic year");
    }

    const { section, classSequence } = await getSectionContext(tenantId, academicYearId, sectionId);

    const subjectMapped = await academicValidator.isSubjectMappedToSection(
      tenantId,
      academicYearId,
      sectionId,
      subjectId
    );
    if (!subjectMapped) throw badRequest("Subject not assigned to section");

    const subject = await Subject.findOne({ _id: subjectId, tenantId, isActive: true }).lean();
    if (!subject) throw badRequest("Invalid subject");

    if (passMarks !== undefined && passMarks > maxMarks) {
      throw badRequest("passMarks cannot exceed maxMarks");
    }

    const displayCode = generateExamSectionSubjectDisplay({
      subjectCode: subject.subjectCode,
      classSequence,
      sectionName: section.sectionName,
      examType: exam.examType ?? "EXAM"
    });

    const data = await academicQueries.createExamSectionSubjectMap(tenantId, academicYearId, {
      examId,
      sectionId,
      subjectId,
      displayCode,
      examDate,
      maxMarks,
      passMarks,
      description
    });
    res.locals.entityId = data._id;
    return successResponse(res, data, "Exam structure created", 201);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getExamStructure = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;

    const exam = await academicQueries.getExamById(tenantId, req.params.examId);
    if (!exam) throw notFound("Exam");

    return successResponse(
      res,
      await academicQueries.getExamStructure(tenantId, req.params.examId)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
