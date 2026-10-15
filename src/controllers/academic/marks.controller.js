import mongoose from "mongoose";
import Teacher from "../../models/user-db/Teacher.js";
import * as academicQueries from "../../queries/academic.queries.js";
import * as academicValidator from "../../queries/academic.validators.js";
import { successResponse, errorResponse } from "../../responses/index.js";
import { badRequest } from "../../utils/appError.util.js";

const MAX_BULK_MARKS = 500;

/* Teacher profile of the logged-in user, if any (admins have none) */
const getEvaluatorId = async req => {
  const teacher = await Teacher.findOne({
    userId: req.user.userId,
    tenantId: req.user.tenantId,
    isActive: true
  })
    .select("_id")
    .lean();
  return teacher?._id;
};

/* Validate one marks entry against its exam structure and build the record to save */
const buildMarksEntry = async (tenantId, entry, evaluatedBy) => {
  const { studentId, examSectionSubjectId, marksObtained, isAbsent = false, grade, remarks } = entry;

  const structure = await academicQueries.getExamStructureEntry(tenantId, examSectionSubjectId);
  if (!structure) throw badRequest("Invalid exam subject structure");

  const inSection = await academicValidator.isStudentInSection(
    tenantId,
    studentId,
    structure.sectionId,
    structure.academicYearId
  );
  if (!inSection) throw badRequest("Student not part of this section");

  if (!isAbsent) {
    const valid =
      typeof marksObtained === "number" &&
      marksObtained >= 0 &&
      marksObtained <= structure.maxMarks;
    if (!valid) throw badRequest(`marksObtained must be between 0 and ${structure.maxMarks}`);
  }

  return {
    studentId,
    examSectionSubjectId,
    academicYearId: structure.academicYearId,
    marksObtained: isAbsent ? null : marksObtained,
    isAbsent,
    grade,
    remarks,
    evaluatedBy,
    evaluatedAt: new Date()
  };
};

export const upsertMarks = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const entry = await buildMarksEntry(tenantId, req.body, await getEvaluatorId(req));

    const data = await academicQueries.upsertMarks(tenantId, entry);
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
      await academicQueries.getMarksByStudent(
        req.user.tenantId,
        req.academicYearId,
        req.params.studentId
      )
    );
  } catch (e) {
    return errorResponse(res, e, next);
  }
};

export const upsertMarksBulk = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const tenantId = req.user.tenantId;
    const { marks } = req.body;

    if (!Array.isArray(marks) || !marks.length) throw badRequest("marks must be a non-empty array");
    if (marks.length > MAX_BULK_MARKS) throw badRequest(`At most ${MAX_BULK_MARKS} marks per request`);

    const evaluatedBy = await getEvaluatorId(req);
    const entries = [];
    for (const [index, entry] of marks.entries()) {
      try {
        entries.push(await buildMarksEntry(tenantId, entry, evaluatedBy));
      } catch (e) {
        if (e.statusCode) e.message = `marks[${index}]: ${e.message}`;
        throw e;
      }
    }

    session.startTransaction();
    const result = await academicQueries.upsertMarksBulk(tenantId, entries, session);
    await session.commitTransaction();

    return successResponse(
      res,
      { matched: result.matchedCount, modified: result.modifiedCount, created: result.upsertedCount },
      "Marks uploaded"
    );
  } catch (e) {
    if (session.inTransaction()) await session.abortTransaction();
    return errorResponse(res, e, next);
  } finally {
    session.endSession();
  }
};
