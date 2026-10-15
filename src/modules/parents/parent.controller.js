import * as parentQueries from "./parent.queries.js";
import * as parentService from "./parent.service.js";
import { successResponse, errorResponse } from "../../common/responses/index.js";
import { badRequest, notFound } from "../../common/utils/appError.util.js";

export const createParent = async (req, res, next) => {
  try {
    if (!req.body?.user) throw badRequest("user is required");

    const parent = await parentService.createParentWithUser(req.user.tenantId, req.body);
    res.locals.entityId = parent.id;
    return successResponse(res, parent, "Parent created", 201);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getParents = async (req, res, next) => {
  try {
    const data = await parentQueries.getParents(req.user.tenantId, req.query);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getParentById = async (req, res, next) => {
  try {
    const data = await parentQueries.getParentById(req.user.tenantId, req.params.parentId);
    if (!data) throw notFound("Parent");
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateParent = async (req, res, next) => {
  try {
    const data = await parentQueries.updateParent(req.user.tenantId, req.params.parentId, req.body);
    if (!data) throw notFound("Parent");
    res.locals.entityId = data.id;
    return successResponse(res, data, "Parent updated");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};
