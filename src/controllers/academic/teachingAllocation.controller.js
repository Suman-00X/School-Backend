import * as academicQueries from "../../queries/academic.queries.js";
import { successResponse, errorResponse } from "../../responses/index.js";
import * as academicValidator from "../../queries/academic.validators.js";

/* Class–Section–Subject */
export const createClassSectionSubjectMap = async (req, res, next) => {
  try {
    const mapped = await academicValidator.isSubjectAlreadyMappedToSection(
      req.user.tenantId,
      req.body.academicYearId,
      req.body.sectionId,
      req.body.subjectId
    );
    if (mapped) throw new Error("Subject already mapped to this section");

    const data = await academicQueries.createClassSectionSubjectMap(
      req.user.tenantId,
      req.academicYearId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Mapping created");
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
    await academicQueries.removeClassSectionSubjectMap(
      req.user.tenantId,
      req.academicYearId,
      req.params.mapId
    );
    res.locals.entityId = req.params.mapId;
    return successResponse(res, null, "Mapping removed");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Teacher–Section–Subject */
export const mapTeacherSectionSubject = async (req, res, next) => {
  try {
    const valid = await academicValidator.isSectionInAcademicYear(
      req.user.tenantId,
      req.body.academicYearId,
      req.body.sectionId
    );
    if (!valid) throw new Error("Invalid section for academic year");

    const subjectMapped = await academicValidator.isSubjectMappedToSection(
      req.user.tenantId,
      req.body.academicYearId,
      req.body.sectionId,
      req.body.subjectId
    );
    if (!subjectMapped) throw new Error("Subject not assigned to section");

    const assigned = await academicValidator.isTeacherAlreadyAssigned(
      req.user.tenantId,
      req.body.academicYearId,
      req.body.teacherId,
      req.body.sectionId,
      req.body.subjectId
    );
    if (assigned) throw new Error("Teacher already assigned to this subject");

    const exists = await academicQueries.isTeacherAlreadyAssigned(
      tenantId,
      req.body.academicYearId,
      req.body.teacherId,
      req.body.sectionId,
      req.body.subjectId
    );
    if (exists) throw new Error("Teacher already assigned to this subject in this section");

    const data = await academicQueries.mapTeacherSectionSubject(
      req.user.tenantId,
      req.academicYearId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Teacher mapped");
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
    await academicQueries.removeTeacherSectionSubjectMap(
      req.user.tenantId,
      req.academicYearId,
      req.params.mapId
    );
    res.locals.entityId = req.params.mapId;
    return successResponse(res, null, "Mapping removed");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
