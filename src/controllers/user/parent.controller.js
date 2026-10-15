import mongoose from "mongoose";
import * as userQueries from "../../queries/user.queries.js";
import { generateParentId } from "../../services/idFormat.service.js";
import { successResponse, errorResponse } from "../../responses/index.js";
import { notFound } from "../../utils/appError.util.js";

export const createParent = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const tenantId = req.user.tenantId;

    const parentUser = await userQueries.createUser(
      tenantId,
      { ...req.body.user, role: "PARENT" },
      session
    );

    const yearYY = new Date().getFullYear().toString().slice(-2);
    const parentCode = await generateParentId({ tenantId, yearYY, session });

    const parent = await userQueries.createParent(
      tenantId,
      { ...req.body.profile, userId: parentUser._id, parentCode },
      session
    );

    await session.commitTransaction();
    res.locals.entityId = parent._id;
    return successResponse(res, parent, "Parent created", 201);
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    return errorResponse(res, error, next);
  } finally {
    session.endSession();
  }
};

export const getParents = async (req, res, next) => {
  try {
    const data = await userQueries.getParents(req.user.tenantId, req.query);
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const getParentById = async (req, res, next) => {
  try {
    const data = await userQueries.getParentById(
      req.user.tenantId,
      req.params.parentId
    );
    if (!data) throw notFound("Parent");
    return successResponse(res, data);
  } catch (error) {
    return errorResponse(res, error, next);
  }
};

export const updateParent = async (req, res, next) => {
  try {
    const data = await userQueries.updateParent(
      req.user.tenantId,
      req.params.parentId,
      req.body
    );
    if (!data) throw notFound("Parent");
    res.locals.entityId = data._id;
    return successResponse(res, data, "Parent updated");
  } catch (error) {
    return errorResponse(res, error, next);
  }
};