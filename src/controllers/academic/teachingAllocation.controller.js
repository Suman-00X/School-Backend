import Subject from "../../models/academic-db/Subject.js";
import Teacher from "../../models/user-db/Teacher.js";
import * as academicQueries from "../../queries/academic.queries.js";
import * as academicValidator from "../../queries/academic.validators.js";
import { getSectionContext } from "../../services/academicContext.service.js";
import { generateClassSectionSubjectDisplay } from "../../services/idFormat.service.js";
import { successResponse, errorResponse } from "../../responses/index.js";
import { badRequest, conflict, notFound } from "../../utils/appError.util.js";

/* Class–Section–Subject */
export const createClassSectionSubjectMap = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const academicYearId = req.academicYearId;
    const { sectionId, subjectId, weeklyNoOfClasses, description } = req.body;

    const { section, classSequence } = await getSectionContext(tenantId, academicYearId, sectionId);

    const subject = await Subject.findOne({ _id: subjectId, tenantId, isActive: true }).lean();
    if (!subject) throw badRequest("Invalid subject");

    const mapped = await academicValidator.isSubjectMappedToSection(
      tenantId,
      academicYearId,
      sectionId,
      subjectId
    );
    if (mapped) throw conflict("Subject already mapped to this section");

    const displayCode = generateClassSectionSubjectDisplay({
      subjectCode: subject.subjectCode,
      classSequence,
      sectionName: section.sectionName
    });

    const data = await academicQueries.createClassSectionSubjectMap(tenantId, academicYearId, {
      sectionId,
      subjectId,
      displayCode,
      weeklyNoOfClasses,
      description
    });
    res.locals.entityId = data._id;
    return successResponse(res, data, "Mapping created", 201);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getSubjectsBySection = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getSubjectsBySection(
        req.user.tenantId,
        req.academicYearId,
        req.params.sectionId
      )
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const removeClassSectionSubjectMap = async (req, res, next) => {
  try {
    const data = await academicQueries.removeClassSectionSubjectMap(
      req.user.tenantId,
      req.params.mapId
    );
    if (!data) throw notFound("Mapping");
    res.locals.entityId = req.params.mapId;
    return successResponse(res, null, "Mapping removed");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Teacher–Section–Subject */
export const mapTeacherSectionSubject = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const academicYearId = req.academicYearId;
    const { teacherId, sectionId, subjectId, description } = req.body;

    const validSection = await academicValidator.isSectionInAcademicYear(
      tenantId,
      academicYearId,
      sectionId
    );
    if (!validSection) throw badRequest("Invalid section for academic year");

    const teacher = await Teacher.exists({ _id: teacherId, tenantId, isActive: true });
    if (!teacher) throw badRequest("Invalid teacher");

    const subjectMapped = await academicValidator.isSubjectMappedToSection(
      tenantId,
      academicYearId,
      sectionId,
      subjectId
    );
    if (!subjectMapped) throw badRequest("Subject not assigned to section");

    const assigned = await academicValidator.isSubjectTeacherAssigned(
      tenantId,
      academicYearId,
      sectionId,
      subjectId
    );
    if (assigned) throw conflict("Subject already has a teacher in this section");

    const data = await academicQueries.mapTeacherSectionSubject(tenantId, academicYearId, {
      teacherId,
      sectionId,
      subjectId,
      description
    });
    res.locals.entityId = data._id;
    return successResponse(res, data, "Teacher mapped", 201);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getTeachersBySection = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getTeachersBySection(
        req.user.tenantId,
        req.academicYearId,
        req.params.sectionId
      )
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const removeTeacherSectionSubjectMap = async (req, res, next) => {
  try {
    const data = await academicQueries.removeTeacherSectionSubjectMap(
      req.user.tenantId,
      req.params.mapId
    );
    if (!data) throw notFound("Mapping");
    res.locals.entityId = req.params.mapId;
    return successResponse(res, null, "Mapping removed");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
