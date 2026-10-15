import * as userQueries from "../../queries/user.queries.js";
import { successResponse, errorResponse } from "../../responses/index.js";
import { notFound } from "../../utils/appError.util.js";

export const createStudent = async (req, res, next) => {
  try {
    const student = await userQueries.createStudent(
      req.user.tenantId,
      req.body
    );
    res.locals.entityId = student._id;
    return successResponse(res, student, "Student created successfully", 201);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getStudents = async (req, res, next) => {
  try {
    const data = await userQueries.getStudents(req.user.tenantId, req.query);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getStudentById = async (req, res, next) => {
  try {
    const data = await userQueries.getStudentById(
      req.user.tenantId,
      req.params.studentId
    );
    if (!data) throw notFound("Student");
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateStudent = async (req, res, next) => {
  try {
    const data = await userQueries.updateStudent(
      req.user.tenantId,
      req.params.studentId,
      req.body
    );
    if (!data) throw notFound("Student");
    res.locals.entityId = data._id;
    return successResponse(res, data, "Student updated");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};