import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../../database/postgres/client.js";
import { classes } from "../../database/postgres/schema/index.js";
import { exists, findOne, scoped, updateOne } from "../../database/postgres/helpers.js";
import { getPagination } from "../../common/utils/pagination.util.js";
import { sanitizeInput } from "../../common/utils/sanitize.util.js";

export const createClass = async (tenantId, payload) => {
  const [row] = await db
    .insert(classes)
    .values({ ...sanitizeInput(payload), tenantId })
    .returning();
  return row;
};

/* All-or-nothing: one INSERT statement */
export const createClassesBulk = (tenantId, items) =>
  db
    .insert(classes)
    .values(items.map(item => ({ ...sanitizeInput(item), tenantId })))
    .returning();

export const getClasses = (tenantId, query = {}) => {
  const { skip, limit } = getPagination(query);
  return db
    .select()
    .from(classes)
    .where(scoped(classes, tenantId))
    .orderBy(asc(classes.classOrder))
    .limit(limit)
    .offset(skip);
};

export const getClassById = (tenantId, classId) =>
  findOne(db, classes, scoped(classes, tenantId, eq(classes.id, classId)));

export const updateClass = (tenantId, classId, payload) =>
  updateOne(db, classes, scoped(classes, tenantId, eq(classes.id, classId)), sanitizeInput(payload));

export const classExists = (tenantId, classId) =>
  exists(db, classes, scoped(classes, tenantId, eq(classes.id, classId)));

export const countClasses = async (tenantId, classIds) => {
  const rows = await db
    .select({ id: classes.id })
    .from(classes)
    .where(scoped(classes, tenantId, inArray(classes.id, classIds)));
  return rows.length;
};
