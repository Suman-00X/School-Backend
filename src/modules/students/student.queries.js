import { desc, eq } from "drizzle-orm";
import { db } from "../../database/postgres/client.js";
import { students } from "../../database/postgres/schema/index.js";
import { exists, scoped, updateOne } from "../../database/postgres/helpers.js";
import { getPagination } from "../../common/utils/pagination.util.js";
import { sanitizeInput } from "../../common/utils/sanitize.util.js";
import { userSummaryColumns } from "../users/user.queries.js";

export const createStudent = async (tenantId, payload, dbc = db) => {
  const [student] = await dbc
    .insert(students)
    .values({ ...sanitizeInput(payload), tenantId })
    .returning();
  return student;
};

export const getStudents = (tenantId, query = {}) => {
  const { skip, limit } = getPagination(query);
  return db.query.students.findMany({
    where: scoped(students, tenantId),
    with: { user: { columns: userSummaryColumns } },
    orderBy: desc(students.createdAt),
    limit,
    offset: skip
  });
};

export const getStudentById = async (tenantId, studentId) =>
  (await db.query.students.findFirst({
    where: scoped(students, tenantId, eq(students.id, studentId)),
    with: { user: { columns: userSummaryColumns } }
  })) ?? null;

export const studentExists = (tenantId, studentId) =>
  exists(db, students, scoped(students, tenantId, eq(students.id, studentId)));

export const updateStudent = (tenantId, studentId, payload) =>
  updateOne(
    db,
    students,
    scoped(students, tenantId, eq(students.id, studentId)),
    sanitizeInput(payload, ["userId"])
  );
