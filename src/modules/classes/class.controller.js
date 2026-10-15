import * as classQueries from "./class.queries.js";
import { successResponse, errorResponse } from "../../common/responses/index.js";
import { notFound } from "../../common/utils/appError.util.js";
import { requireItems } from "../../common/utils/bulk.util.js";

export const createClass = async (req, res, next) => {
  try {
    const data = await classQueries.createClass(req.user.tenantId, req.body);
    res.locals.entityId = data.id;
    return successResponse(res, data, "Class created", 201);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const createClassesBulk = async (req, res, next) => {
  try {
    const classes = requireItems(req.body.classes, "classes");
    return successResponse(
      res,
      await classQueries.createClassesBulk(req.user.tenantId, classes),
      "Classes created",
      201
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getClasses = async (req, res, next) => {
  try {
    return successResponse(res, await classQueries.getClasses(req.user.tenantId, req.query));
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getClassById = async (req, res, next) => {
  try {
    const data = await classQueries.getClassById(req.user.tenantId, req.params.classId);
    if (!data) throw notFound("Class");
    return successResponse(res, data);
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const updateClass = async (req, res, next) => {
  try {
    const data = await classQueries.updateClass(req.user.tenantId, req.params.classId, req.body);
    if (!data) throw notFound("Class");
    res.locals.entityId = data.id;
    return successResponse(res, data, "Class updated");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
