import * as marksQueries from "./marks.queries.js";
import * as marksService from "./marks.service.js";
import { successResponse, errorResponse } from "../../common/responses/index.js";

export const upsertMarks = async (req, res, next) => {
  try {
    const data = await marksService.saveMarks(req.user, req.body);
    res.locals.entityId = data.id;
    return successResponse(res, data, "Marks saved");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const upsertMarksBulk = async (req, res, next) => {
  try {
    return successResponse(res, await marksService.saveMarksBulk(req.user, req.body.marks), "Marks uploaded");
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const getMarksByStudent = async (req, res, next) => {
  try {
    return successResponse(
      res,
      await marksQueries.getMarksByStudent(req.user.tenantId, req.academicYearId, req.params.studentId)
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};
