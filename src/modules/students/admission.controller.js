import * as admissionService from "./admission.service.js";
import { successResponse, errorResponse } from "../../common/responses/index.js";
import { badRequest } from "../../common/utils/appError.util.js";

export const addStudent = async (req, res, next) => {
  try {
    const { student, admission } = req.body;

    if (!student?.user || !student?.profile) throw badRequest("student.user and student.profile are required");
    if (!admission?.academicYearId || !admission?.sectionId) {
      throw badRequest("admission.academicYearId and admission.sectionId are required");
    }

    const data = await admissionService.admitStudent(req.user.tenantId, req.body);

    res.locals.entityId = data.student.id;
    return successResponse(res, data, "Student admitted successfully", 201);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};
