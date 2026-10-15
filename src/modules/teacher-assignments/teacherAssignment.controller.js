import * as teacherAssignmentQueries from "./teacherAssignment.queries.js";
import * as sectionQueries from "../sections/section.queries.js";
import * as sectionSubjectQueries from "../section-subjects/sectionSubject.queries.js";
import * as teacherQueries from "../teachers/teacher.queries.js";
import { successResponse, errorResponse } from "../../common/responses/index.js";
import { badRequest, conflict, notFound } from "../../common/utils/appError.util.js";

/* Assign a teacher to a subject of a section in the resolved academic year */
export const createTeacherAssignment = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const academicYearId = req.academicYearId;
    const { teacherId, sectionId, subjectId, description } = req.body;

    const validSection = await sectionQueries.isSectionInAcademicYear(tenantId, academicYearId, sectionId);
    if (!validSection) throw badRequest("Invalid section for academic year");

    if (!(await teacherQueries.teacherExists(tenantId, teacherId))) throw badRequest("Invalid teacher");

    const subjectMapped = await sectionSubjectQueries.isSubjectMappedToSection(
      tenantId,
      academicYearId,
      sectionId,
      subjectId
    );
    if (!subjectMapped) throw badRequest("Subject not assigned to section");

    const assigned = await teacherAssignmentQueries.isSubjectTeacherAssigned(
      tenantId,
      academicYearId,
      sectionId,
      subjectId
    );
    if (assigned) throw conflict("Subject already has a teacher in this section");

    const data = await teacherAssignmentQueries.createTeacherAssignment(tenantId, academicYearId, {
      teacherId,
      sectionId,
      subjectId,
      description
    });
    res.locals.entityId = data.id;
    return successResponse(res, data, "Teacher mapped", 201);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getTeachersBySection = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await teacherAssignmentQueries.getTeachersBySection(
        req.user.tenantId,
        req.academicYearId,
        req.params.sectionId
      )
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const removeTeacherAssignment = async (req, res, next) => {
  try {
    const data = await teacherAssignmentQueries.removeTeacherAssignment(req.user.tenantId, req.params.mapId);
    if (!data) throw notFound("Mapping");
    res.locals.entityId = req.params.mapId;
    return successResponse(res, null, "Mapping removed");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
