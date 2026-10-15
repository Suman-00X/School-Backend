import * as examQueries from "./exam.queries.js";
import * as examSubjectQueries from "./examSubject.queries.js";
import * as subjectQueries from "../subjects/subject.queries.js";
import * as sectionSubjectQueries from "../section-subjects/sectionSubject.queries.js";
import { getSectionContext } from "../sections/section.service.js";
import { generateExamSectionSubjectDisplay } from "../../common/services/idFormat.service.js";
import { successResponse, errorResponse } from "../../common/responses/index.js";
import { badRequest, notFound } from "../../common/utils/appError.util.js";

/* Exam structure: which subject papers a section sits in an exam */
export const createExamSubject = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const academicYearId = req.academicYearId;
    const { examId, sectionId, subjectId, examDate, maxMarks, passMarks, description } = req.body;

    const exam = await examQueries.getExamById(tenantId, examId);
    if (!exam || exam.academicYearId !== academicYearId) {
      throw badRequest("Exam does not belong to academic year");
    }

    const { section, classSequence } = await getSectionContext(tenantId, academicYearId, sectionId);

    const subjectMapped = await sectionSubjectQueries.isSubjectMappedToSection(
      tenantId,
      academicYearId,
      sectionId,
      subjectId
    );
    if (!subjectMapped) throw badRequest("Subject not assigned to section");

    const subject = await subjectQueries.getSubjectById(tenantId, subjectId);
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

    const data = await examSubjectQueries.createExamSubject(tenantId, academicYearId, {
      examId,
      sectionId,
      subjectId,
      displayCode,
      examDate,
      maxMarks,
      passMarks,
      description
    });
    res.locals.entityId = data.id;
    return successResponse(res, data, "Exam structure created", 201);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getExamStructure = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;

    if (!(await examQueries.getExamById(tenantId, req.params.examId))) throw notFound("Exam");

    return successResponse(res, await examSubjectQueries.getExamStructure(tenantId, req.params.examId));
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
