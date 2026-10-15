import mongoose from "mongoose";

import * as userQueries from "../../queries/user.queries.js";
import * as academicQueries from "../../queries/academic.queries.js";
import * as academicValidator from "../../queries/academic.validators.js";
import { getSectionContext } from "../../services/academicContext.service.js";

import {
  generateStudentId,
  generateParentId,
  generateStudentRollNumber
} from "../../services/idFormat.service.js";

import { successResponse, errorResponse } from "../../responses/index.js";
import { badRequest, conflict } from "../../utils/appError.util.js";

/* New admission: creates the student's user + profile, parents, and the
   section mapping for the given academic year, all in one transaction */
export const addStudent = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const tenantId = req.user.tenantId;
    const { student, parents = [], admission } = req.body;

    if (!student?.user || !student?.profile) throw badRequest("student.user and student.profile are required");
    if (!admission?.academicYearId || !admission?.sectionId) {
      throw badRequest("admission.academicYearId and admission.sectionId are required");
    }

    /* 1. Validate academic year + section, and derive codes from them */
    const { academicYear, section, yearYY, classSequence } = await getSectionContext(
      tenantId,
      admission.academicYearId,
      admission.sectionId
    );

    session.startTransaction();

    /* 2. Create student user */
    const studentUser = await userQueries.createUser(
      tenantId,
      { ...student.user, role: "STUDENT" },
      session
    );

    /* 3. Generate student code */
    const studentCode = await generateStudentId({
      tenantId,
      admissionYearYY: yearYY,
      classSequence,
      session
    });

    /* 4. Create student profile */
    const studentRecord = await userQueries.createStudent(
      tenantId,
      { ...student.profile, userId: studentUser._id, studentCode },
      session
    );

    /* 5. Create parents */
    for (const parent of parents) {
      const parentUser = await userQueries.createUser(
        tenantId,
        { ...parent.user, role: "PARENT" },
        session
      );

      const parentCode = await generateParentId({
        tenantId,
        yearYY,
        session
      });

      const parentRecord = await userQueries.createParent(
        tenantId,
        { ...parent.profile, userId: parentUser._id, parentCode },
        session
      );

      await userQueries.mapStudentParent(
        tenantId,
        {
          studentId: studentRecord._id,
          parentId: parentRecord._id,
          relation: parent.relation,
          isPrimaryContact: parent.isPrimaryContact
        },
        session
      );
    }

    /* 6. Generate roll number */
    const rollNumber = await generateStudentRollNumber({
      tenantId,
      academicYearYY: yearYY,
      classSequence,
      sectionName: section.sectionName,
      session
    });

    /* 7. Admission */
    const admissionRecord = await academicQueries.mapStudentToSection(
      tenantId,
      {
        studentId: studentRecord._id,
        academicYearId: academicYear._id,
        sectionId: section._id,
        rollNumber,
        admissionType: admission.admissionType ?? "NEW",
        status: "ACTIVE"
      },
      session
    );

    await session.commitTransaction();

    res.locals.entityId = studentRecord._id;

    return successResponse(
      res,
      { student: studentRecord, admission: admissionRecord },
      "Student admitted successfully",
      201
    );
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    return errorResponse(res, error, next);
  } finally {
    session.endSession();
  }
};

/* Move a student from their section in one academic year to a section in another */
export const promoteStudent = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const tenantId = req.user.tenantId;

    const {
      studentId,
      fromAcademicYearId,
      toAcademicYearId,
      toSectionId,
      admissionType = "PROMOTED"
    } = req.body;

    if (!studentId || !fromAcademicYearId || !toAcademicYearId || !toSectionId) {
      throw badRequest("studentId, fromAcademicYearId, toAcademicYearId and toSectionId are required");
    }
    if (String(fromAcademicYearId) === String(toAcademicYearId)) {
      throw badRequest("Target academic year must differ from the current one");
    }

    /* 1. section must belong to new academic year */
    const { section, yearYY, classSequence } = await getSectionContext(
      tenantId,
      toAcademicYearId,
      toSectionId
    );

    /* 2. prevent double promotion */
    const already = await academicValidator.isStudentAlreadyAdmitted(
      tenantId,
      toAcademicYearId,
      studentId
    );
    if (already) throw conflict("Student already promoted");

    /* 3. student must exist in previous academic year */
    const previous = await academicQueries.getStudentAdmission(
      tenantId,
      studentId,
      fromAcademicYearId
    );
    if (!previous) throw badRequest("Student not found in previous academic year");

    session.startTransaction();

    /* 4. generate roll number */
    const rollNumber = await generateStudentRollNumber({
      tenantId,
      academicYearYY: yearYY,
      classSequence,
      sectionName: section.sectionName,
      session
    });

    /* 5. create new admission */
    const admission = await academicQueries.mapStudentToSection(
      tenantId,
      {
        studentId,
        academicYearId: toAcademicYearId,
        sectionId: toSectionId,
        rollNumber,
        admissionType,
        status: "ACTIVE"
      },
      session
    );

    /* 6. mark old as LEFT */
    await academicQueries.closePreviousAdmission(
      tenantId,
      previous._id,
      session
    );

    await session.commitTransaction();

    res.locals.entityId = admission._id;
    return successResponse(res, admission, "Student promoted successfully", 201);

  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    return errorResponse(res, err, next);
  } finally {
    session.endSession();
  }
};
