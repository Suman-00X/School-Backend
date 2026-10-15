import mongoose from "mongoose";
import AcademicYear from "../../models/academic-db/AcademicYear.js";
import Section from "../../models/academic-db/Section.js";

import * as userQueries from "../../queries/user.queries.js";
import * as academicQueries from "../../queries/academic.queries.js";
import * as academicValidator from "../../queries/academic.validators.js";

import {
  generateStudentId,
  generateParentId,
  generateStudentRollNumber
} from "../../services/idFormat.service.js";

import { successResponse } from "../../responses/success.response.js";
import { errorResponse } from "../../responses/error.response.js";

export const addStudent = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const tenantId = req.user.tenantId;
    const { student, parents = [], admission } = req.body;

      /* 0. Validate section belongs to academic year */
    const valid = await academicValidator.isSectionInAcademicYear(
      tenantId,
      admission.academicYearId,
      admission.sectionId
    );
    if (!valid) throw new Error("Section does not belong to academic year");

    /* 1. Validate academic year */
    const academicYear = await AcademicYear.findOne({
      _id: admission.academicYearId,
      tenantId,
      isActive: true
    });

    if (!academicYear) throw new Error("Invalid academic year");

    /* 2. Validate section belongs to academic year */
    const section = await Section.findOne({
      _id: admission.sectionId,
      tenantId,
      academicYearId: admission.academicYearId,
      isActive: true
    });

    if (!section) throw new Error("Section does not belong to academic year");

    /* 3. Prevent duplicate admission */
    const alreadyAdmitted = await academicValidator.isStudentAlreadyAdmitted(
      tenantId,
      admission.academicYearId,
      student?.profile?.studentId
    );
    if (alreadyAdmitted) throw new Error("Student already admitted in this academic year");

    /* 4. Create student user */
    const studentUser = await userQueries.createUser(
      tenantId,
      { ...student.user, role: "STUDENT" },
      session
    );

    const yearYY = academicYear.startDate.getFullYear().toString().slice(-2);

    /* 5. Generate student code */
    const studentCode = await generateStudentId({
      tenantId,
      admissionYearYY: yearYY,
      classSequence: admission.classSequence,
      session
    });

    /* 6. Create student profile */
    const studentRecord = await userQueries.createStudent(
      tenantId,
      { ...student.profile, userId: studentUser._id, studentCode },
      session
    );

    /* 7. Create parents */
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
        { userId: parentUser._id, parentCode },
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

    /* 8. Generate roll number */
    const rollNumber = await generateStudentRollNumber({
      tenantId,
      academicYearYY: yearYY,
      classSequence: admission.classSequence,
      sectionName: section.sectionName,
      session
    });

    /* 9. Prevent duplicate roll number */
    const rollExists = await academicValidator.isRollNumberTaken(
      tenantId,
      admission.academicYearId,
      section._id,
      rollNumber
    );

    if (rollExists) throw new Error("Roll number already exists in section");

    /* 10. Admission */
    const admissionRecord = await academicQueries.mapStudentToSection(
      tenantId,
      {
        studentId: studentRecord._id,
        academicYearId: academicYear._id,
        sectionId: section._id,
        rollNumber,
        admissionType: admission.admissionType,
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
    await session.abortTransaction();
    return errorResponse(res, error, next);
  } finally {
    session.endSession();
  }
};

export const promoteStudent = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const tenantId = req.user.tenantId;

    const {
      studentId,
      fromAcademicYearId,
      toAcademicYearId,
      toSectionId,
      admissionType = "PROMOTED"
    } = req.body;

    /* 1. section must belong to new academic year */
    const validSection = await academicValidator.isSectionInAcademicYear(
      tenantId,
      toAcademicYearId,
      toSectionId
    );
    if (!validSection) throw new Error("Section not in target academic year");

    /* 2. student must exist in previous academic year */
    const previous = await academicQueries.getStudentAdmission(
      tenantId,
      studentId,
      fromAcademicYearId
    );
    if (!previous) throw new Error("Student not found in previous academic year");

    /* 3. prevent double promotion */
    const already = await academicQueries.isStudentAlreadyAdmitted(
      tenantId,
      toAcademicYearId,
      studentId
    );
    if (already) throw new Error("Student already promoted");

    /* 4. generate roll number */
    const rollNumber = await generateStudentRollNumber({
      tenantId,
      academicYearYY: targetYearYY,
      classSequence: targetClassSequence,
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
    return successResponse(res, admission, "Student promoted successfully");

  } catch (err) {
    await session.abortTransaction();
    return errorResponse(res, err, next);
  } finally {
    session.endSession();
  }
};