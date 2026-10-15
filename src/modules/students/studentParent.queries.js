import { eq } from "drizzle-orm";
import { db } from "../../database/postgres/client.js";
import { studentParents } from "../../database/postgres/schema/index.js";
import { exists, scoped, updateOne } from "../../database/postgres/helpers.js";
import { userSummaryColumns } from "../users/user.queries.js";

export const mapStudentParent = async (tenantId, payload, dbc = db) => {
  const [mapping] = await dbc
    .insert(studentParents)
    .values({ ...payload, tenantId })
    .returning();
  return mapping;
};

export const getParentsByStudent = (tenantId, studentId) =>
  db.query.studentParents.findMany({
    where: scoped(studentParents, tenantId, eq(studentParents.studentId, studentId)),
    with: {
      parent: {
        columns: { id: true, parentCode: true, occupation: true },
        with: { user: { columns: userSummaryColumns } }
      }
    }
  });

export const isParentLinked = (tenantId, studentId, parentId) =>
  exists(
    db,
    studentParents,
    scoped(studentParents, tenantId, eq(studentParents.studentId, studentId), eq(studentParents.parentId, parentId))
  );

/* Soft remove */
export const removeStudentParentMap = (tenantId, mapId) =>
  updateOne(
    db,
    studentParents,
    scoped(studentParents, tenantId, eq(studentParents.id, mapId)),
    { isActive: false }
  );
