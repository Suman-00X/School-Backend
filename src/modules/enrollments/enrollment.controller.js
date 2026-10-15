import * as enrollmentQueries from "./enrollment.queries.js";
import * as enrollmentService from "./enrollment.service.js";
import * as studentQueries from "../students/student.queries.js";
import * as sectionQueries from "../sections/section.queries.js";
import { getSectionContext } from "../sections/section.service.js";
import { generateStudentRollNumber } from "../../common/services/idFormat.service.js";
import { successResponse, errorResponse } from "../../common/responses/index.js";
import { badRequest, conflict, notFound } from "../../common/utils/appError.util.js";
import { pick } from "../../common/utils/sanitize.util.js";

/* Enroll an existing student in a section of the resolved academic year */
export const mapStudentToSection = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const academicYearId = req.academicYearId;
    const { studentId, sectionId, admissionType = "NEW", description } = req.body;

    if (!(await studentQueries.studentExists(tenantId, studentId))) throw badRequest("Invalid student");

    const { section, yearYY, classSequence } = await getSectionContext(tenantId, academicYearId, sectionId);

    if (await enrollmentQueries.isStudentEnrolled(tenantId, academicYearId, studentId)) {
      throw conflict("Student already mapped for this academic year");
    }

    const rollNumber =
      req.body.rollNumber ??
      (await generateStudentRollNumber({
        tenantId,
        academicYearYY: yearYY,
        classSequence,
        sectionName: section.sectionName
      }));

    if (await enrollmentQueries.isRollNumberTaken(tenantId, sectionId, rollNumber)) {
      throw conflict("Roll number already exists in section");
    }

    const data = await enrollmentQueries.createEnrollment(tenantId, {
      studentId,
      academicYearId,
      sectionId,
      rollNumber,
      admissionType,
      description,
      status: "ACTIVE"
    });
    res.locals.entityId = data.id;
    return successResponse(res, data, "Student mapped to section", 201);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Students of a section in the resolved academic year */
export const getStudentsBySection = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await enrollmentQueries.getStudentsBySection(
        req.user.tenantId,
        req.academicYearId,
        req.params.sectionId
      )
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Change section / roll number / status */
export const updateStudentSectionMap = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const academicYearId = req.academicYearId;

    if (req.body.sectionId) {
      const validSection = await sectionQueries.isSectionInAcademicYear(tenantId, academicYearId, req.body.sectionId);
      if (!validSection) throw badRequest("Section does not belong to academic year");
    }

    const data = await enrollmentQueries.updateEnrollment(
      tenantId,
      academicYearId,
      req.params.mapId,
      pick(req.body, ["sectionId", "rollNumber", "status", "admissionType", "description"])
    );
    if (!data) throw notFound("Student section mapping");
    res.locals.entityId = data.id;
    return successResponse(res, data, "Student section updated");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const promoteStudent = async (req, res, next) => {
  try {
    const data = await enrollmentService.promoteStudent(req.user.tenantId, req.body);
    res.locals.entityId = data.id;
    return successResponse(res, data, "Student promoted successfully", 201);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
