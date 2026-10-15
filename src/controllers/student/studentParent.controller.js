import Student from "../../models/user-db/Student.js";
import Parent from "../../models/user-db/Parent.js";
import StudentParentMap from "../../models/user-db/StudentParentMap.js";
import * as userQueries from "../../queries/user.queries.js";
import { successResponse } from "../../responses/success.response.js";
import { errorResponse } from "../../responses/error.response.js";

/* Map parent to student */
export const mapStudentParent = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { studentId, parentId } = req.body;

    /* Validate student */
    const student = await Student.findOne({ _id: studentId, tenantId, isActive: true });
    if (!student) throw new Error("Invalid student");

    /* Validate parent */
    const parent = await Parent.findOne({ _id: parentId, tenantId, isActive: true });
    if (!parent) throw new Error("Invalid parent");

    /* Prevent duplicate mapping */
    const existing = await StudentParentMap.findOne({
      tenantId,
      studentId,
      parentId,
      isActive: true
    });
    if (existing) throw new Error("Parent already mapped to student");

    const data = await userQueries.mapStudentParent(tenantId, req.body);

    res.locals.entityId = data._id;
    return successResponse(res, data, "Parent mapped to student");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Get parents */
export const getParentsByStudent = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const studentId = req.params.studentId;

    const student = await Student.findOne({ _id: studentId, tenantId, isActive: true });
    if (!student) throw new Error("Invalid student");

    const data = await userQueries.getParentsByStudent(tenantId, studentId);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

/* Soft remove mapping */
export const removeStudentParentMap = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const mapId = req.params.mapId;

    const mapping = await StudentParentMap.findOne({ _id: mapId, tenantId, isActive: true });
    if (!mapping) throw new Error("Mapping not found");

    await userQueries.removeStudentParentMap(tenantId, mapId);

    res.locals.entityId = mapId;
    return successResponse(res, null, "Mapping removed");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};