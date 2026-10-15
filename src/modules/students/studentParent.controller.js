import * as studentParentQueries from "./studentParent.queries.js";
import * as studentQueries from "./student.queries.js";
import * as parentQueries from "../parents/parent.queries.js";
import { successResponse, errorResponse } from "../../common/responses/index.js";
import { badRequest, conflict, notFound } from "../../common/utils/appError.util.js";

/* Map parent to student */
export const mapStudentParent = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { studentId, parentId, relation, isPrimaryContact } = req.body;

    if (!(await studentQueries.studentExists(tenantId, studentId))) throw badRequest("Invalid student");
    if (!(await parentQueries.parentExists(tenantId, parentId))) throw badRequest("Invalid parent");

    if (await studentParentQueries.isParentLinked(tenantId, studentId, parentId)) {
      throw conflict("Parent already mapped to student");
    }

    const data = await studentParentQueries.mapStudentParent(tenantId, {
      studentId,
      parentId,
      relation,
      isPrimaryContact
    });

    res.locals.entityId = data.id;
    return successResponse(res, data, "Parent mapped to student", 201);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Get parents */
export const getParentsByStudent = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const studentId = req.params.studentId;

    if (!(await studentQueries.studentExists(tenantId, studentId))) throw notFound("Student");

    const data = await studentParentQueries.getParentsByStudent(tenantId, studentId);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Soft remove mapping */
export const removeStudentParentMap = async (req, res, next) => {
  try {
    const data = await studentParentQueries.removeStudentParentMap(req.user.tenantId, req.params.mapId);
    if (!data) throw notFound("Mapping");

    res.locals.entityId = req.params.mapId;
    return successResponse(res, null, "Mapping removed");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};
