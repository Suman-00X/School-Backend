import * as userQueries from "../../queries/user.queries.js";
import { successResponse } from "../../responses/success.response.js";
import { errorResponse } from "../../responses/error.response.js";

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
    res.locals.entityId = data._id;
    return successResponse(res, data, "Student updated");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};