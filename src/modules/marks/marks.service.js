import * as marksQueries from "./marks.queries.js";
import * as examSubjectQueries from "../exams/examSubject.queries.js";
import * as enrollmentQueries from "../enrollments/enrollment.queries.js";
import * as teacherQueries from "../teachers/teacher.queries.js";
import { badRequest } from "../../common/utils/appError.util.js";

const MAX_BULK_MARKS = 500;

/* Validate one entry against its exam paper and build the row to save */
const buildMarksEntry = async (tenantId, entry, evaluatedBy) => {
  const { studentId, examSubjectId, marksObtained, isAbsent = false, grade, remarks } = entry;

  const examSubject = await examSubjectQueries.getExamSubjectById(tenantId, examSubjectId);
  if (!examSubject) throw badRequest("Invalid exam subject structure");

  const inSection = await enrollmentQueries.isStudentInSection(
    tenantId,
    studentId,
    examSubject.sectionId,
    examSubject.academicYearId
  );
  if (!inSection) throw badRequest("Student not part of this section");

  if (!isAbsent) {
    const valid =
      typeof marksObtained === "number" &&
      marksObtained >= 0 &&
      marksObtained <= examSubject.maxMarks;
    if (!valid) throw badRequest(`marksObtained must be between 0 and ${examSubject.maxMarks}`);
  }

  return {
    studentId,
    examSubjectId,
    academicYearId: examSubject.academicYearId,
    marksObtained: isAbsent ? null : marksObtained,
    isAbsent,
    grade: grade ?? null,
    remarks: remarks ?? null,
    evaluatedBy: evaluatedBy ?? null,
    evaluatedAt: new Date()
  };
};

/* Teacher profile of the logged-in user, if any (admins have none) */
const getEvaluatorId = async user =>
  (await teacherQueries.getTeacherByUserId(user.tenantId, user.userId))?.id;

export const saveMarks = async (user, entry) => {
  const row = await buildMarksEntry(user.tenantId, entry, await getEvaluatorId(user));
  const [{ id }] = await marksQueries.upsertMarks(user.tenantId, [row]);
  return marksQueries.getMarksById(user.tenantId, id);
};

export const saveMarksBulk = async (user, entries) => {
  if (!Array.isArray(entries) || !entries.length) throw badRequest("marks must be a non-empty array");
  if (entries.length > MAX_BULK_MARKS) throw badRequest(`At most ${MAX_BULK_MARKS} marks per request`);

  const keys = entries.map(e => `${e.studentId}:${e.examSubjectId}`);
  if (new Set(keys).size !== keys.length) throw badRequest("Duplicate student/exam subject pairs in request");

  const evaluatedBy = await getEvaluatorId(user);
  const rows = [];
  for (const [index, entry] of entries.entries()) {
    try {
      rows.push(await buildMarksEntry(user.tenantId, entry, evaluatedBy));
    } catch (e) {
      if (e.statusCode) e.message = `marks[${index}]: ${e.message}`;
      throw e;
    }
  }

  /* Single statement, so it is all-or-nothing */
  const result = await marksQueries.upsertMarks(user.tenantId, rows);
  const created = result.filter(r => r.created).length;
  return { created, updated: result.length - created };
};
