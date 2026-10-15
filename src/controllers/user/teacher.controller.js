import mongoose from "mongoose";
import * as userQueries from "../../queries/user.queries.js";
import { generateTeacherId } from "../../services/idFormat.service.js";
import { successResponse } from "../../responses/success.response.js";
import { errorResponse } from "../../responses/error.response.js";

export const createTeacher = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const tenantId = req.user.tenantId;

    const joiningYearYY =
      req.body.profile?.joiningDate
        ? new Date(req.body.profile.joiningDate).getFullYear().toString().slice(-2)
        : new Date().getFullYear().toString().slice(-2);

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
      { ...req.body.profile, userId: user._id, employeeCode },
      session
    );

    await session.commitTransaction();
    res.locals.entityId = teacher._id;
    return successResponse(res, teacher, "Teacher created successfully");
  } catch (error) {
    await session.abortTransaction();
    return errorResponse(res, error, next);
  } finally {
    session.endSession();
  }
};

export const getTeachers = async (req, res, next) => {
  try {
    const data = await userQueries.getTeachers(req.user.tenantId, req.query);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getTeacherById = async (req, res, next) => {
  try {
    const data = await userQueries.getTeacherById(
      req.user.tenantId,
      req.params.teacherId
    );
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateTeacher = async (req, res, next) => {
  try {
    const data = await userQueries.updateTeacher(
      req.user.tenantId,
      req.params.teacherId,
      req.body
    );
    res.locals.entityId = data._id;
    return successResponse(res, data, "Teacher updated");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};