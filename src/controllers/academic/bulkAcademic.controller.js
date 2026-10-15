import Class from "../../models/academic-db/Class.js";
import * as academicQueries from "../../queries/academic.queries.js";
import { successResponse, errorResponse } from "../../responses/index.js";
import { badRequest } from "../../utils/appError.util.js";

const MAX_BULK_ITEMS = 200;

const requireItems = (items, name) => {
  if (!Array.isArray(items) || !items.length) throw badRequest(`${name} must be a non-empty array`);
  if (items.length > MAX_BULK_ITEMS) throw badRequest(`At most ${MAX_BULK_ITEMS} ${name} per request`);
  return items;
};

/* Classes */
export const createClassesBulk = async (req, res, next) => {
  try {
    const classes = requireItems(req.body.classes, "classes");
    return successResponse(
      res,
      await academicQueries.createClassesBulk(req.user.tenantId, classes),
      "Classes created",
      201
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Subjects (no academic year needed) */
export const createSubjectsBulk = async (req, res, next) => {
  try {
    const subjects = requireItems(req.body.subjects, "subjects");
    return successResponse(
      res,
      await academicQueries.createSubjectsBulk(req.user.tenantId, subjects),
      "Subjects created",
      201
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Sections (in the resolved academic year) */
export const createSectionsBulk = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const sections = requireItems(req.body.sections, "sections");

    const classIds = [...new Set(sections.map(s => String(s.classId)))];
    const found = await Class.countDocuments({ _id: { $in: classIds }, tenantId, isActive: true });
    if (found !== classIds.length) throw badRequest("One or more sections reference an invalid class");

    return successResponse(
      res,
      await academicQueries.createSectionsBulk(tenantId, req.academicYearId, sections),
      "Sections created",
      201
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Exams (in the resolved academic year) */
export const createExamsBulk = async (req, res, next) => {
  try {
    const exams = requireItems(req.body.exams, "exams");
    return successResponse(
      res,
      await academicQueries.createExamsBulk(req.user.tenantId, req.academicYearId, exams),
      "Exams created",
      201
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
