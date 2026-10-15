import * as userQueries from "../../queries/user.queries.js";
import { successResponse, errorResponse } from "../../responses/index.js";
import { notFound } from "../../utils/appError.util.js";

export const createUser = async (req, res, next) => {
  try {
    const user = await userQueries.createUser(req.user.tenantId, req.body);
    res.locals.entityId = user._id;
    return successResponse(res, user, "User created successfully", 201);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getUsers = async (req, res, next) => {
  try {
    const users = await userQueries.getUsers(req.user.tenantId, req.query);
    return successResponse(res, users);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const user = await userQueries.getUserById(
      req.user.tenantId,
      req.params.userId
    );
    if (!user) throw notFound("User");
    return successResponse(res, user);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const user = await userQueries.updateUser(
      req.user.tenantId,
      req.params.userId,
      req.body
    );
    if (!user) throw notFound("User");
    res.locals.entityId = user._id;
    return successResponse(res, user, "User updated successfully");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const deactivateUser = async (req, res, next) => {
  try {
    const user = await userQueries.deactivateUser(req.user.tenantId, req.params.userId);
    if (!user) throw notFound("User");
    res.locals.entityId = req.params.userId;
    return successResponse(res, null, "User deactivated successfully");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};
