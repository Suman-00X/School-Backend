import * as studentQueries from "./student.queries.js";
import * as userQueries from "../users/user.queries.js";
import { successResponse, errorResponse } from "../../common/responses/index.js";
import { badRequest, notFound } from "../../common/utils/appError.util.js";

/* Profile for an existing STUDENT user. New admissions use POST /students/admission. */
export const createStudent = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;

    const user = req.body.userId && (await userQueries.getUserById(tenantId, req.body.userId));
    if (!user || user.role !== "STUDENT") throw badRequest("userId must be an active STUDENT user");

    const student = await studentQueries.createStudent(tenantId, req.body);
    res.locals.entityId = student.id;
    return successResponse(res, student, "Student created successfully", 201);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getStudents = async (req, res, next) => {
  try {
    const data = await studentQueries.getStudents(req.user.tenantId, req.query);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getStudentById = async (req, res, next) => {
  try {
    const data = await studentQueries.getStudentById(req.user.tenantId, req.params.studentId);
    if (!data) throw notFound("Student");
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateStudent = async (req, res, next) => {
  try {
    const data = await studentQueries.updateStudent(req.user.tenantId, req.params.studentId, req.body);
    if (!data) throw notFound("Student");
    res.locals.entityId = data.id;
    return successResponse(res, data, "Student updated");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};
