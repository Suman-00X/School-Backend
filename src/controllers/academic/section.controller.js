import Class from "../../models/academic-db/Class.js";
import Section from "../../models/academic-db/Section.js";
import * as academicQueries from "../../queries/academic.queries.js";
import { successResponse, errorResponse } from "../../responses/index.js";

/* Create */
export const createSection = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { classId } = req.body;

    const cls = await Class.findOne({ _id: classId, tenantId, isActive: true });
    if (!cls) throw new Error("Invalid class");

    const data = await academicQueries.createSection(tenantId, req.body);

    res.locals.entityId = data._id;
    return successResponse(res, data, "Section created");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* List */
export const getSections = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getSections(req.user.tenantId, req.query)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Get one */
export const getSectionById = async (req, res, next) => {
  try {
    const data = await academicQueries.getSectionById(req.user.tenantId, req.params.sectionId);
    if (!data) throw new Error("Section not found");
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

    const cls = await Class.findOne({ _id: classId, tenantId, isActive: true });
    if (!cls) throw new Error("Invalid class");

    return successResponse(
      res,
      await academicQueries.getSectionsByClass(tenantId, classId)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

/* Update */
export const updateSection = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const sectionId = req.params.sectionId;

    const section = await Section.findOne({ _id: sectionId, tenantId, isActive: true });
    if (!section) throw new Error("Section not found");

    if (req.body.classId) {
      const cls = await Class.findOne({ _id: req.body.classId, tenantId, isActive: true });
      if (!cls) throw new Error("Invalid class");
    }

    const data = await academicQueries.updateSection(tenantId, sectionId, req.body);

    res.locals.entityId = data._id;
    return successResponse(res, data, "Section updated");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};