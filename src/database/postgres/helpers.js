import { and, eq } from "drizzle-orm";

/* Active rows of one tenant, plus any extra conditions */
export const scoped = (table, tenantId, ...conditions) =>
  and(eq(table.tenantId, tenantId), eq(table.isActive, true), ...conditions);

export const findOne = async (dbc, table, where, columns) => {
  const [row] = await (columns ? dbc.select(columns) : dbc.select()).from(table).where(where).limit(1);
  return row ?? null;
};

export const exists = async (dbc, table, where) => {
  const [row] = await dbc.select({ id: table.id }).from(table).where(where).limit(1);
  return Boolean(row);
};

/* Update the first matching row and return it (null when nothing matched) */
export const updateOne = async (dbc, table, where, values, columns) => {
  if (!Object.keys(values).length) return findOne(dbc, table, where, columns);

  const query = dbc.update(table).set(values).where(where);
  const [row] = await (columns ? query.returning(columns) : query.returning());
  return row ?? null;
};
