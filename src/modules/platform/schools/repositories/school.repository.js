import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { platformDb } from "../../../../common/tenancy/context.js";
import { platformTenants } from "../../../../common/tenancy/registry.schema.js";

/* Schools as the platform registry knows them (where their data lives is never returned) */
const columns = {
  id: platformTenants.id,
  code: platformTenants.code,
  name: platformTenants.name,
  status: platformTenants.status,
  enabledModules: platformTenants.enabledModules,
  studentCount: platformTenants.studentCount,
  createdAt: platformTenants.createdAt,
  updatedAt: platformTenants.updatedAt
};

const escapeLike = text => text.replace(/[\\%_]/g, char => `\\${char}`);

const ORDER = {
  newest: [desc(platformTenants.createdAt)],
  oldest: [asc(platformTenants.createdAt)],
  name: [asc(platformTenants.name)],
  students: [sql`${platformTenants.studentCount} DESC NULLS LAST`, asc(platformTenants.name)]
};

/* Search (name or code) and module: shared by the page and the per-status counts */
const matching = ({ search, module }) => {
  const pattern = search && `%${escapeLike(search)}%`;
  return [
    pattern ? or(ilike(platformTenants.name, pattern), ilike(platformTenants.code, pattern)) : undefined,
    /* null enabled_modules: every module is on */
    module
      ? or(isNull(platformTenants.enabledModules), sql`${module} = ANY(${platformTenants.enabledModules})`)
      : undefined
  ];
};

export const schoolRepository = {
  /* -> { rows, meta: { page, limit, total, totalPages, statusCounts } } */
  list: async ({ search, status, module, sort = "newest", page = 1, limit = 20 }) => {
    const filters = matching({ search, module });
    const where = and(...filters, status ? eq(platformTenants.status, status) : undefined);
    const [rows, [{ total }], byStatus] = await Promise.all([
      platformDb()
        .select(columns)
        .from(platformTenants)
        .where(where)
        .orderBy(...ORDER[sort])
        .limit(limit)
        .offset((page - 1) * limit),
      platformDb().select({ total: count() }).from(platformTenants).where(where),
      platformDb()
        .select({ status: platformTenants.status, total: count() })
        .from(platformTenants)
        .where(and(...filters))
        .groupBy(platformTenants.status)
    ]);
    const statusCounts = { ACTIVE: 0, SUSPENDED: 0 };
    for (const row of byStatus) statusCounts[row.status] = Number(row.total);
    return {
      rows,
      meta: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit), statusCounts }
    };
  },

  findById: async id => {
    const [row] = await platformDb().select(columns).from(platformTenants).where(eq(platformTenants.id, id)).limit(1);
    return row ?? null;
  },

  codeTaken: async code => {
    const [row] = await platformDb()
      .select({ id: platformTenants.id })
      .from(platformTenants)
      .where(eq(platformTenants.code, code))
      .limit(1);
    return Boolean(row);
  },

  update: async (id, changes) => {
    const [row] = await platformDb()
      .update(platformTenants)
      .set(changes)
      .where(eq(platformTenants.id, id))
      .returning(columns);
    return row ?? null;
  }
};
