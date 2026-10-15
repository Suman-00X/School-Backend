import { asc, eq } from "drizzle-orm";
import { db } from "../../database/postgres/client.js";
import { subjects } from "../../database/postgres/schema/index.js";
import { findOne, scoped, updateOne } from "../../database/postgres/helpers.js";
import { getPagination } from "../../common/utils/pagination.util.js";
import { sanitizeInput } from "../../common/utils/sanitize.util.js";

/* Subject codes are stored upper-case (MA01, EN01) */
const normalize = payload => {
  const values = sanitizeInput(payload);
  if (typeof values.subjectCode === "string") values.subjectCode = values.subjectCode.trim().toUpperCase();
  return values;
};

export const createSubject = async (tenantId, payload) => {
  const [row] = await db
    .insert(subjects)
    .values({ ...normalize(payload), tenantId })
    .returning();
  return row;
};

/* All-or-nothing: one INSERT statement */
export const createSubjectsBulk = (tenantId, items) =>
  db
    .insert(subjects)
    .values(items.map(item => ({ ...normalize(item), tenantId })))
    .returning();

export const getSubjects = (tenantId, query = {}) => {
  const { skip, limit } = getPagination(query);
  return db
    .select()
    .from(subjects)
    .where(scoped(subjects, tenantId))
    .orderBy(asc(subjects.subjectName))
    .limit(limit)
    .offset(skip);
};

export const getSubjectById = (tenantId, subjectId) =>
  findOne(db, subjects, scoped(subjects, tenantId, eq(subjects.id, subjectId)));

export const updateSubject = (tenantId, subjectId, payload) =>
  updateOne(db, subjects, scoped(subjects, tenantId, eq(subjects.id, subjectId)), normalize(payload));
