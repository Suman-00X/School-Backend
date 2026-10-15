import mongoose from "mongoose";
import User from "../models/user-db/User.js";
import Student from "../models/user-db/Student.js";
import Parent from "../models/user-db/Parent.js";
import StudentParentMap from "../models/user-db/StudentParentMap.js";
import StudentSectionMap from "../models/academic-db/StudentSectionMap.js";

import * as userQueries from "../queries/user.queries.js";
import * as academicQueries from "../queries/academic.queries.js";
import { successResponse } from "../responses/success.response.js";
import { errorResponse } from "../responses/error.response.js";

import {generateStudentId, generateParentId, generateTeacherId, generateStudentRollNumber} from "../services/idFormat.service.js";


/* Users */
export const createUser = async (req, res, next) => {
  try {
    const user = await userQueries.createUser(
      req.user.tenantId,
      req.body
    );
    res.locals.entityId = user._id;
    return successResponse(res, user, "User created successfully");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getUsers = async (req, res, next) => {
  try {
    const users = await userQueries.getUsers(
      req.user.tenantId,
      req.query
    );
    return successResponse(res, users);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const user = await userQueries.getUserById(
      req.user.tenantId,
      req.params.userId
    );
    return successResponse(res, user);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const user = await userQueries.updateUser(
      req.user.tenantId,
      req.params.userId,
      req.body
    );
    res.locals.entityId = user._id;
    return successResponse(res, user, "User updated successfully");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const deactivateUser = async (req, res, next) => {
  try {
    await userQueries.deactivateUser(
      req.user.tenantId,
      req.params.userId
    );
    res.locals.entityId = req.params.userId;
    return successResponse(res, null, "User deactivated successfully");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Teachers */
export const createTeacher = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const tenantId = req.user.tenantId;
    const joiningYearYY = req.body.joiningYearYY;

    const user = await userQueries.createUser(
      tenantId,
      { ...req.body.user, role: "TEACHER" },
      session
    );

    const employeeCode = await generateTeacherId({
      tenantId,
      joiningYearYY,
      session
    });

    const teacher = await userQueries.createTeacher(
      tenantId,
      {
        ...req.body.profile,
        userId: user._id,
        employeeCode
      },
      session
    );

    await session.commitTransaction();
    session.endSession();

    res.locals.entityId = teacher._id;
    return successResponse(res, teacher, "Teacher created successfully");
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return errorResponse(res, error, next);
  }
};

export const getTeachers = async (req, res, next) => {
  try {
    const teachers = await userQueries.getTeachers(
      req.user.tenantId,
      req.query
    );
    return successResponse(res, teachers);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getTeacherById = async (req, res, next) => {
  try {
    const teacher = await userQueries.getTeacherById(
      req.user.tenantId,
      req.params.teacherId
    );
    return successResponse(res, teacher);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateTeacher = async (req, res, next) => {
  try {
    const teacher = await userQueries.updateTeacher(
      req.user.tenantId,
      req.params.teacherId,
      req.body
    );
    res.locals.entityId = teacher._id;
    return successResponse(res, teacher, "Teacher updated successfully");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Students */
export const addStudent = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const tenantId = req.user.tenantId;
    const { student, parents = [], admission } = req.body;

    /* Create student user */
    const studentUser = await userQueries.createUser(
      tenantId,
      { ...student.user, role: "STUDENT" },
      session
    );

    /* Generate studentCode */
    const studentCode = await generateStudentId({
      tenantId,
      admissionYearYY: admission.yearYY,
      classSequence: admission.classSequence,
      session
    });

    /* Create student profile */
    const studentRecord = await userQueries.createStudent(
      tenantId,
      {
        ...student.profile,
        userId: studentUser._id,
        studentCode
      },
      session
    );

    /* Parents */
    for (const parent of parents) {
      const parentUser = await userQueries.createUser(
        tenantId,
        { ...parent.user, role: "PARENT" },
        session
      );

      const parentCode = await generateParentId({
        tenantId,
        yearYY: admission.yearYY,
        session
      });

      const parentRecord = await userQueries.createParent(
        tenantId,
        {
          userId: parentUser._id,
          parentCode
        },
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

    /* Roll number */
    const rollNumber = await generateStudentRollNumber({
      tenantId,
      academicYearYY: admission.yearYY,
      classSequence: admission.classSequence,
      sectionName: admission.sectionName,
      session
    });

    /* Admission */
    const admissionRecord = await academicQueries.mapStudentToSection(
      tenantId,
      {
        studentId: studentRecord._id,
        academicYearId: admission.academicYearId,
        sectionId: admission.sectionId,
        rollNumber,
        admissionType: admission.admissionType,
        status: "ACTIVE"
      },
      session
    );

    await session.commitTransaction();
    session.endSession();

    res.locals.entityId = studentRecord._id;
    return successResponse(
      res,
      { student: studentRecord, admission: admissionRecord },
      "Student admitted successfully",
      201
    );
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return errorResponse(res, error, next);
  }
};

export const createStudent = async (req, res, next) => {
  try {
    const student = await userQueries.createStudent(
      req.user.tenantId,
      req.body
    );
    return successResponse(res, student, "Student created successfully");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getStudents = async (req, res, next) => {
  try {
    const students = await userQueries.getStudents(
      req.user.tenantId,
      req.query
    );
    return successResponse(res, students);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getStudentById = async (req, res, next) => {
  try {
    const student = await userQueries.getStudentById(
      req.user.tenantId,
      req.params.studentId
    );
    return successResponse(res, student);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateStudent = async (req, res, next) => {
  try {
    const student = await userQueries.updateStudent(
      req.user.tenantId,
      req.params.studentId,
      req.body
    );
    res.locals.entityId = student._id;
    return successResponse(res, student, "Student updated successfully");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Parents */
export const createParent = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const tenantId = req.user.tenantId;
    const { user, profile } = req.body;

    /* create parent user */
    const parentUser = await userQueries.createUser(
      tenantId,
      { ...user, role: "PARENT" },
      session
    );

    /* generate parentCode */
    
    const parentCode = await generateParentId({
      tenantId,
      yearYY,
      session
    });

    /* create parent profile */
    const parent = await userQueries.createParent(
      tenantId,
      {
        ...profile,
        userId: parentUser._id,
        parentCode
      },
      session
    );

    await session.commitTransaction();
    session.endSession();

    res.locals.entityId = parent._id;
    return successResponse(res, parent, "Parent created successfully");
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return errorResponse(res, error, next);
  }
};

export const getParents = async (req, res, next) => {
  try {
    const parents = await userQueries.getParents(
      req.user.tenantId,
      req.query
    );
    return successResponse(res, parents);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getParentById = async (req, res, next) => {
  try {
    const parent = await userQueries.getParentById(
      req.user.tenantId,
      req.params.parentId
    );
    return successResponse(res, parent);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateParent = async (req, res, next) => {
  try {
    const parent = await userQueries.updateParent(
      req.user.tenantId,
      req.params.parentId,
      req.body
    );
    res.locals.entityId = parent._id;
    return successResponse(res, parent, "Parent updated successfully");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Student Parent Mapping */
export const mapStudentParent = async (req, res, next) => {
  try {
    const mapping = await userQueries.mapStudentParent(
      req.user.tenantId,
      req.body
    );
    res.locals.entityId = mapping._id;
    return successResponse(res, mapping, "Parent mapped to student");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getParentsByStudent = async (req, res, next) => {
  try {
    const parents = await userQueries.getParentsByStudent(
      req.user.tenantId,
      req.params.studentId
    );
    return successResponse(res, parents);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const removeStudentParentMap = async (req, res, next) => {
  try {
    await userQueries.removeStudentParentMap(
      req.user.tenantId,
      req.params.mapId
    );
    res.locals.entityId = req.params.mapId;
    return successResponse(res, null, "Mapping removed successfully");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Bulk Students */
export const addStudentsBulk = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const tenantId = req.user.tenantId;
    const { students } = req.body;

    const studentUsers = [];
    const studentProfiles = [];
    const parentUsers = [];
    const parentProfiles = [];
    const studentParentMaps = [];
    const admissions = [];

    /* 1. Prepare users */
    for (const item of students) {
      studentUsers.push({
        ...item.student.user,
        role: "STUDENT",
        tenantId
      });

      studentProfiles.push({
        ...item.student.profile,
        admissionYearYY: item.admission.yearYY,
        classSequence: item.admission.classSequence
      });

      for (const parent of item.parents || []) {
        parentUsers.push({
          ...parent.user,
          role: "PARENT",
          tenantId
        });

        parentProfiles.push({
          relation: parent.relation,
          isPrimaryContact: parent.isPrimaryContact,
          yearYY: item.admission.yearYY
        });
      }
    }

    /* 2. Create users */
    const createdStudentUsers = await User.insertMany(studentUsers, { session });
    const createdParentUsers = parentUsers.length
      ? await User.insertMany(parentUsers, { session })
      : [];

    /* 3. Create students with studentCode */
    const createdStudents = [];

    for (let i = 0; i < createdStudentUsers.length; i++) {
      const studentCode = await generateStudentId({
        tenantId,
        admissionYearYY: studentProfiles[i].admissionYearYY,
        classSequence: studentProfiles[i].classSequence,
        session
      });

      createdStudents.push({
        ...studentProfiles[i],
        userId: createdStudentUsers[i]._id,
        studentCode,
        tenantId
      });
    }

    const insertedStudents = await Student.insertMany(createdStudents, { session });

    /* 4. Create parents with parentCode */
    const createdParents = [];

    for (let i = 0; i < createdParentUsers.length; i++) {
      const parentCode = await generateParentId({
        tenantId,
        yearYY: parentProfiles[i].yearYY,
        session
      });

      createdParents.push({
        userId: createdParentUsers[i]._id,
        parentCode,
        tenantId
      });
    }

    const insertedParents = createdParents.length
      ? await Parent.insertMany(createdParents, { session })
      : [];

    /* 5. Map parents + admissions */
    let parentIndex = 0;

    students.forEach((item, studentIndex) => {
      const studentId = insertedStudents[studentIndex]._id;

      for (const parent of item.parents || []) {
        studentParentMaps.push({
          studentId,
          parentId: insertedParents[parentIndex]._id,
          relation: parent.relation,
          isPrimaryContact: parent.isPrimaryContact,
          tenantId
        });
        parentIndex++;
      }

      admissions.push({
        studentId,
        academicYearId: item.admission.academicYearId,
        sectionId: item.admission.sectionId,
        rollNumber: null, // filled next
        admissionType: item.admission.admissionType,
        status: "ACTIVE",
        tenantId
      });
    });

    /* 6. Generate roll numbers */
    for (let i = 0; i < admissions.length; i++) {
      const rollNumber = await generateStudentRollNumber({
        tenantId,
        academicYearYY: students[i].admission.yearYY,
        classSequence: students[i].admission.classSequence,
        sectionName: students[i].admission.sectionName,
        session
      });

      admissions[i].rollNumber = rollNumber;
    }

    /* 7. Persist mappings */
    if (studentParentMaps.length) {
      await StudentParentMap.insertMany(studentParentMaps, { session });
    }

    await StudentSectionMap.insertMany(admissions, { session });

    await session.commitTransaction();
    session.endSession();

    return successResponse(
      res,
      { count: students.length },
      "Students admitted successfully"
    );
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return errorResponse(res, error, next);
  }
};