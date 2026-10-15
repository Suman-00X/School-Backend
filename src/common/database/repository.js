import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { db } from "./postgres.js";
import { buildPageMeta } from "../utils/pagination.util.js";

/* Never writable through a repository */
const PROTECTED_FIELDS = new Set(["id", "tenantId", "createdAt", "updatedAt"]);

const writable = values =>
  Object.fromEntries(
    Object.entries(values ?? {}).filter(([key, value]) => !PROTECTED_FIELDS.has(key) && value !== undefined)
  );

/* Active rows of one tenant, plus extra conditions. Every read goes through this. */
export const scoped = (table, tenantId, ...conditions) =>
  and(eq(table.tenantId, tenantId), eq(table.isActive, true), ...conditions);

/* Tenant-scoped data access for one table.

     const classRepository = createRepository({ table: classes, queryKey: "classes" });

   - queryKey: the table's export name in the schema (enables `with` relations)
   - hiddenColumns: never returned (e.g. passwordHash)
   - orderBy: default list order (newest first if omitted)

   Every method takes tenantId first and an optional { dbc } to join a transaction. */
export const createRepository = ({ table, queryKey, hiddenColumns = [], orderBy }) => {
  const visibleColumns = Object.fromEntries(
    Object.entries(getTableColumns(table)).filter(([name]) => !hiddenColumns.includes(name))
  );
  const columnFilter = hiddenColumns.length ? Object.fromEntries(hiddenColumns.map(name => [name, false])) : undefined;
  const defaultOrder = orderBy ?? desc(table.createdAt);
  const relational = dbc => dbc.query[queryKey];

  const findFirst = async (dbc, where, relations) =>
    (await relational(dbc).findFirst({ where, columns: columnFilter, with: relations })) ?? null;

  return {
    table,

    /* scoped(table, tenantId, ...conditions) for custom queries */
    where: (tenantId, ...conditions) => scoped(table, tenantId, ...conditions),

    findById: (tenantId, id, { dbc = db, with: relations } = {}) =>
      findFirst(dbc, scoped(table, tenantId, eq(table.id, id)), relations),

    findOne: (tenantId, conditions = [], { dbc = db, with: relations } = {}) =>
      findFirst(dbc, scoped(table, tenantId, ...conditions), relations),

    exists: async (tenantId, conditions = [], { dbc = db } = {}) => {
      const [row] = await dbc
        .select({ id: table.id })
        .from(table)
        .where(scoped(table, tenantId, ...conditions))
        .limit(1);
      return Boolean(row);
    },

    count: (tenantId, conditions = [], { dbc = db } = {}) => dbc.$count(table, scoped(table, tenantId, ...conditions)),

    /* -> { rows, meta: { page, limit, total, totalPages } } */
    list: async (
      tenantId,
      { conditions = [], page = 1, limit = 20, orderBy: order, with: relations, dbc = db } = {}
    ) => {
      const where = scoped(table, tenantId, ...conditions);
      const [rows, total] = await Promise.all([
        relational(dbc).findMany({
          where,
          columns: columnFilter,
          with: relations,
          orderBy: order ?? defaultOrder,
          limit,
          offset: (page - 1) * limit
        }),
        dbc.$count(table, where)
      ]);
      return { rows, meta: buildPageMeta(page, limit, total) };
    },

    create: async (tenantId, values, { dbc = db } = {}) => {
      const [row] = await dbc
        .insert(table)
        .values({ ...writable(values), tenantId })
        .returning(visibleColumns);
      return row;
    },

    /* One INSERT statement: all rows or none */
    createMany: (tenantId, items, { dbc = db } = {}) =>
      dbc
        .insert(table)
        .values(items.map(item => ({ ...writable(item), tenantId })))
        .returning(visibleColumns),

    /* -> updated row, or null when no active row matched */
    update: async (tenantId, id, values, { dbc = db, conditions = [] } = {}) => {
      const where = scoped(table, tenantId, eq(table.id, id), ...conditions);
      const changes = writable(values);
      if (!Object.keys(changes).length) return findFirst(dbc, where);

      const [row] = await dbc.update(table).set(changes).where(where).returning(visibleColumns);
      return row ?? null;
    },

    /* Sets is_active = false -> removed row, or null */
    softDelete: async (tenantId, id, { dbc = db } = {}) => {
      const [row] = await dbc
        .update(table)
        .set({ isActive: false })
        .where(scoped(table, tenantId, eq(table.id, id)))
        .returning(visibleColumns);
      return row ?? null;
    }
  };
};
