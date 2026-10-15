import * as teacherQueries from "./teacher.queries.js";
import * as teacherService from "./teacher.service.js";
import { successResponse, errorResponse } from "../../common/responses/index.js";
import { badRequest, notFound } from "../../common/utils/appError.util.js";

export const createTeacher = async (req, res, next) => {
  try {
    if (!req.body?.user) throw badRequest("user is required");

    const teacher = await teacherService.createTeacherWithUser(req.user.tenantId, req.body);
    res.locals.entityId = teacher.id;
    return successResponse(res, teacher, "Teacher created successfully", 201);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getTeachers = async (req, res, next) => {
  try {
    const data = await teacherQueries.getTeachers(req.user.tenantId, req.query);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getTeacherById = async (req, res, next) => {
  try {
    const data = await teacherQueries.getTeacherById(req.user.tenantId, req.params.teacherId);
    if (!data) throw notFound("Teacher");
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateTeacher = async (req, res, next) => {
  try {
    const data = await teacherQueries.updateTeacher(req.user.tenantId, req.params.teacherId, req.body);
    if (!data) throw notFound("Teacher");
    res.locals.entityId = data.id;
    return successResponse(res, data, "Teacher updated");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};
