import { asc, eq } from "drizzle-orm";
import { db } from "../../database/postgres/client.js";
import { exams } from "../../database/postgres/schema/index.js";
import { findOne, scoped, updateOne } from "../../database/postgres/helpers.js";
import { getPagination } from "../../common/utils/pagination.util.js";
import { sanitizeInput } from "../../common/utils/sanitize.util.js";

export const createExam = async (tenantId, academicYearId, payload) => {
  const [row] = await db
    .insert(exams)
    .values({ ...sanitizeInput(payload), tenantId, academicYearId })
    .returning();
  return row;
};

/* All-or-nothing: one INSERT statement */
export const createExamsBulk = (tenantId, academicYearId, items) =>
  db
    .insert(exams)
    .values(items.map(item => ({ ...sanitizeInput(item), tenantId, academicYearId })))
    .returning();

export const getExams = (tenantId, academicYearId, query = {}) => {
  const { skip, limit } = getPagination(query);
  return db
    .select()
    .from(exams)
    .where(scoped(exams, tenantId, eq(exams.academicYearId, academicYearId)))
    .orderBy(asc(exams.startDate), asc(exams.examName))
    .limit(limit)
    .offset(skip);
};

export const getExamById = (tenantId, examId) =>
  findOne(db, exams, scoped(exams, tenantId, eq(exams.id, examId)));

export const updateExam = (tenantId, examId, payload) =>
  updateOne(
    db,
    exams,
    scoped(exams, tenantId, eq(exams.id, examId)),
    sanitizeInput(payload, ["academicYearId"])
  );
