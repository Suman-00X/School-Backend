import Class from "../../models/academic-db/Class.js";
import Teacher from "../../models/user-db/Teacher.js";
import * as academicQueries from "../../queries/academic.queries.js";
import { successResponse, errorResponse } from "../../responses/index.js";
import { badRequest, notFound } from "../../utils/appError.util.js";

const assertClassExists = async (tenantId, classId) => {
  const cls = await Class.exists({ _id: classId, tenantId, isActive: true });
  if (!cls) throw badRequest("Invalid class");
};

const assertTeacherExists = async (tenantId, teacherId) => {
  const teacher = await Teacher.exists({ _id: teacherId, tenantId, isActive: true });
  if (!teacher) throw badRequest("Invalid class teacher");
};

/* Create (in the resolved academic year) */
export const createSection = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;

    await assertClassExists(tenantId, req.body.classId);
    if (req.body.classTeacherId) await assertTeacherExists(tenantId, req.body.classTeacherId);

    const data = await academicQueries.createSection(tenantId, req.academicYearId, req.body);

    res.locals.entityId = data._id;
    return successResponse(res, data, "Section created", 201);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* List */
export const getSections = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getSections(req.user.tenantId, req.academicYearId, req.query)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Get one */
export const getSectionById = async (req, res, next) => {
  try {
    const data = await academicQueries.getSectionById(req.user.tenantId, req.params.sectionId);
    if (!data) throw notFound("Section");
    return successResponse(res, data);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* By class */
export const getSectionsByClass = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const classId = req.params.classId;

    const cls = await Class.exists({ _id: classId, tenantId, isActive: true });
    if (!cls) throw notFound("Class");

    return successResponse(
      res,
      await academicQueries.getSectionsByClass(tenantId, req.academicYearId, classId)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Update */
export const updateSection = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;

    if (req.body.classId) await assertClassExists(tenantId, req.body.classId);
    if (req.body.classTeacherId) await assertTeacherExists(tenantId, req.body.classTeacherId);

    const data = await academicQueries.updateSection(tenantId, req.params.sectionId, req.body);
    if (!data) throw notFound("Section");

    res.locals.entityId = data._id;
    return successResponse(res, data, "Section updated");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
