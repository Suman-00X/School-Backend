import { desc, eq } from "drizzle-orm";
import { db } from "../../database/postgres/client.js";
import { parents } from "../../database/postgres/schema/index.js";
import { exists, scoped, updateOne } from "../../database/postgres/helpers.js";
import { getPagination } from "../../common/utils/pagination.util.js";
import { sanitizeInput } from "../../common/utils/sanitize.util.js";
import { userSummaryColumns } from "../users/user.queries.js";

export const createParent = async (tenantId, payload, dbc = db) => {
  const [parent] = await dbc
    .insert(parents)
    .values({ ...sanitizeInput(payload), tenantId })
    .returning();
  return parent;
};

export const getParents = (tenantId, query = {}) => {
  const { skip, limit } = getPagination(query);
  return db.query.parents.findMany({
    where: scoped(parents, tenantId),
    with: { user: { columns: userSummaryColumns } },
    orderBy: desc(parents.createdAt),
    limit,
    offset: skip
  });
};

export const getParentById = async (tenantId, parentId) =>
  (await db.query.parents.findFirst({
    where: scoped(parents, tenantId, eq(parents.id, parentId)),
    with: { user: { columns: userSummaryColumns } }
  })) ?? null;

export const parentExists = (tenantId, parentId) =>
  exists(db, parents, scoped(parents, tenantId, eq(parents.id, parentId)));

export const updateParent = (tenantId, parentId, payload) =>
  updateOne(
    db,
    parents,
    scoped(parents, tenantId, eq(parents.id, parentId)),
    sanitizeInput(payload, ["userId"])
  );
