import * as sectionQueries from "./section.queries.js";
import * as classQueries from "../classes/class.queries.js";
import * as teacherQueries from "../teachers/teacher.queries.js";
import { successResponse, errorResponse } from "../../common/responses/index.js";
import { badRequest, notFound } from "../../common/utils/appError.util.js";
import { requireItems } from "../../common/utils/bulk.util.js";

const assertClassExists = async (tenantId, classId) => {
  if (!(await classQueries.classExists(tenantId, classId))) throw badRequest("Invalid class");
};

const assertTeacherExists = async (tenantId, teacherId) => {
  if (!(await teacherQueries.teacherExists(tenantId, teacherId))) throw badRequest("Invalid class teacher");
};

/* Create (in the resolved academic year) */
export const createSection = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;

    await assertClassExists(tenantId, req.body.classId);
    if (req.body.classTeacherId) await assertTeacherExists(tenantId, req.body.classTeacherId);

    const data = await sectionQueries.createSection(tenantId, req.academicYearId, req.body);

    res.locals.entityId = data.id;
    return successResponse(res, data, "Section created", 201);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Bulk create (in the resolved academic year) */
export const createSectionsBulk = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const sections = requireItems(req.body.sections, "sections");

    const classIds = [...new Set(sections.map(s => String(s.classId)))];
    if ((await classQueries.countClasses(tenantId, classIds)) !== classIds.length) {
      throw badRequest("One or more sections reference an invalid class");
    }

    return successResponse(
      res,
      await sectionQueries.createSectionsBulk(tenantId, req.academicYearId, sections),
      "Sections created",
      201
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* List */
export const getSections = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await sectionQueries.getSections(req.user.tenantId, req.academicYearId, req.query)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Get one */
export const getSectionById = async (req, res, next) => {
  try {
    const data = await sectionQueries.getSectionById(req.user.tenantId, req.params.sectionId);
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

    if (!(await classQueries.classExists(tenantId, classId))) throw notFound("Class");

    return successResponse(
      res,
      await sectionQueries.getSectionsByClass(tenantId, req.academicYearId, classId)
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

    const data = await sectionQueries.updateSection(tenantId, req.params.sectionId, req.body);
    if (!data) throw notFound("Section");

    res.locals.entityId = data.id;
    return successResponse(res, data, "Section updated");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
