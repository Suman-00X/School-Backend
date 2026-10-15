import { desc, eq } from "drizzle-orm";
import { db } from "../../database/postgres/client.js";
import { teachers } from "../../database/postgres/schema/index.js";
import { exists, findOne, scoped, updateOne } from "../../database/postgres/helpers.js";
import { getPagination } from "../../common/utils/pagination.util.js";
import { sanitizeInput } from "../../common/utils/sanitize.util.js";
import { userSummaryColumns } from "../users/user.queries.js";

export const createTeacher = async (tenantId, payload, dbc = db) => {
  const [teacher] = await dbc
    .insert(teachers)
    .values({ ...sanitizeInput(payload), tenantId })
    .returning();
  return teacher;
};

export const getTeachers = (tenantId, query = {}) => {
  const { skip, limit } = getPagination(query);
  return db.query.teachers.findMany({
    where: scoped(teachers, tenantId),
    with: { user: { columns: userSummaryColumns } },
    orderBy: desc(teachers.createdAt),
    limit,
    offset: skip
  });
};

export const getTeacherById = async (tenantId, teacherId) =>
  (await db.query.teachers.findFirst({
    where: scoped(teachers, tenantId, eq(teachers.id, teacherId)),
    with: { user: { columns: userSummaryColumns } }
  })) ?? null;

export const getTeacherByUserId = (tenantId, userId) =>
  findOne(db, teachers, scoped(teachers, tenantId, eq(teachers.userId, userId)), { id: teachers.id });

export const teacherExists = (tenantId, teacherId) =>
  exists(db, teachers, scoped(teachers, tenantId, eq(teachers.id, teacherId)));

export const updateTeacher = (tenantId, teacherId, payload) =>
  updateOne(
    db,
    teachers,
    scoped(teachers, tenantId, eq(teachers.id, teacherId)),
    sanitizeInput(payload, ["userId"])
  );
