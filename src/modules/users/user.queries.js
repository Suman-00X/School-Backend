import { desc, eq, getTableColumns } from "drizzle-orm";
import { db } from "../../database/postgres/client.js";
import { users } from "../../database/postgres/schema/index.js";
import { findOne, scoped, updateOne } from "../../database/postgres/helpers.js";
import { getPagination } from "../../common/utils/pagination.util.js";
import { sanitizeInput } from "../../common/utils/sanitize.util.js";

/* Every column except password_hash */
const { passwordHash: _passwordHash, ...publicColumns } = getTableColumns(users);
export const publicUserColumns = publicColumns;

/* Columns embedded when another record includes its user */
export const userSummaryColumns = { id: true, firstName: true, lastName: true, email: true, phone: true };

const normalize = payload => {
  const values = sanitizeInput(payload);
  if (typeof values.email === "string") values.email = values.email.trim().toLowerCase();
  return values;
};

export const createUser = async (tenantId, payload, dbc = db) => {
  const [user] = await dbc
    .insert(users)
    .values({ ...normalize(payload), tenantId })
    .returning(publicUserColumns);
  return user;
};

export const getUsers = (tenantId, query = {}) => {
  const { skip, limit } = getPagination(query);
  return db
    .select(publicUserColumns)
    .from(users)
    .where(scoped(users, tenantId))
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(skip);
};

export const getUserById = (tenantId, userId) =>
  findOne(db, users, scoped(users, tenantId, eq(users.id, userId)), publicUserColumns);

export const updateUser = (tenantId, userId, payload) =>
  updateOne(db, users, scoped(users, tenantId, eq(users.id, userId)), normalize(payload), publicUserColumns);

export const deactivateUser = (tenantId, userId) =>
  updateOne(
    db,
    users,
    scoped(users, tenantId, eq(users.id, userId)),
    { isActive: false, status: "INACTIVE" },
    publicUserColumns
  );
