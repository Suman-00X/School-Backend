import Student from "../../models/user-db/Student.js";
import * as academicQueries from "../../queries/academic.queries.js";
import * as academicValidator from "../../queries/academic.validators.js";
import { getSectionContext } from "../../services/academicContext.service.js";
import { generateStudentRollNumber } from "../../services/idFormat.service.js";
import { successResponse, errorResponse } from "../../responses/index.js";
import { badRequest, conflict, notFound } from "../../utils/appError.util.js";

/* Map an existing student to a section of the resolved academic year */
export const mapStudentToSection = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const academicYearId = req.academicYearId;
    const { studentId, sectionId, admissionType = "NEW", description } = req.body;

    const student = await Student.exists({ _id: studentId, tenantId, isActive: true });
    if (!student) throw badRequest("Invalid student");

    const { section, yearYY, classSequence } = await getSectionContext(
      tenantId,
      academicYearId,
      sectionId
    );

    const exists = await academicValidator.isStudentAlreadyAdmitted(
      tenantId,
      academicYearId,
      studentId
    );
    if (exists) throw conflict("Student already mapped for this academic year");

    const rollNumber =
      req.body.rollNumber ??
      (await generateStudentRollNumber({
        tenantId,
        academicYearYY: yearYY,
        classSequence,
        sectionName: section.sectionName
      }));

    const rollTaken = await academicValidator.isRollNumberTaken(
      tenantId,
      academicYearId,
      sectionId,
      rollNumber
    );
    if (rollTaken) throw conflict("Roll number already exists in section");

    const data = await academicQueries.mapStudentToSection(tenantId, {
      studentId,
      academicYearId,
      sectionId,
      rollNumber,
      admissionType,
      description,
      status: "ACTIVE"
    });
    res.locals.entityId = data._id;
    return successResponse(res, data, "Student mapped to section", 201);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Get students of section in the resolved academic year */
export const getStudentsBySection = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getStudentsBySection(
        req.user.tenantId,
        req.academicYearId,
        req.params.sectionId
      )
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Update mapping (change section / roll number / status) */
export const updateStudentSectionMap = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const academicYearId = req.academicYearId;
    const { sectionId, rollNumber, status, admissionType, description } = req.body;

    if (sectionId) {
      const validSection = await academicValidator.isSectionInAcademicYear(
        tenantId,
        academicYearId,
        sectionId
      );
      if (!validSection) throw badRequest("Section does not belong to academic year");
    }

    const update = Object.fromEntries(
      Object.entries({ sectionId, rollNumber, status, admissionType, description })
        .filter(([, value]) => value !== undefined)
    );

    const data = await academicQueries.updateStudentSectionMap(
      tenantId,
      academicYearId,
      req.params.mapId,
      update
    );
    if (!data) throw notFound("Student section mapping");
    res.locals.entityId = data._id;
    return successResponse(res, data, "Student section updated");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
