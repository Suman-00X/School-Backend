import mongoose from "mongoose";
import * as academicQueries from "../../queries/academic.queries.js";
import { successResponse, errorResponse } from "../../responses/index.js";
import * as academicValidator from "../../queries/academic.validators.js";

export const upsertMarks = async (req, res, next) => {
  try {
    const structureExists = await academicValidator.doesExamStructureExist(
      req.user.tenantId,
      req.body.examSectionSubjectId
    );
    if (!structureExists) throw new Error("Invalid exam subject structure");

    const valid = await academicValidator.isStudentInSection(
      req.user.tenantId,
      req.body.studentId,
      req.body.examSectionSubjectId
    );
    if (!valid) throw new Error("Student not part of this section");

    await academicQueries.validateExamSectionBelongsToYear(
      req.user.tenantId,
      req.body.examSectionSubjectId
    );

    const data = await academicQueries.upsertMarks(req.user.tenantId, req.body);
    res.locals.entityId = data._id;
    return successResponse(res, data, "Marks saved");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getMarksByStudent = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await academicQueries.getMarksByStudent(req.user.tenantId, req.params.studentId)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const upsertMarksBulk = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await academicQueries.validateBulkExamSections(req.user.tenantId, req.body.marks);
    session.startTransaction();
    const data = await academicQueries.upsertMarksBulk(
      req.user.tenantId,
      req.body.marks,
      session
    );
    await session.commitTransaction();
    return successResponse(res, data, "Marks uploaded");
  } catch (e) {
    await session.abortTransaction();
    return errorResponse(res, e, next);
  } finally {
    session.endSession();
  }
};