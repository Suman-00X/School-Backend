import { and, desc, eq, ilike, or } from "drizzle-orm";
import { platformDb } from "../../../../common/tenancy/context.js";
import { platformTenants } from "../../../../common/tenancy/registry.schema.js";

/* Schools as the platform registry knows them (where their data lives is never returned) */
const columns = {
  id: platformTenants.id,
  code: platformTenants.code,
  name: platformTenants.name,
  status: platformTenants.status,
  enabledModules: platformTenants.enabledModules,
  createdAt: platformTenants.createdAt,
  updatedAt: platformTenants.updatedAt
};

const escapeLike = text => text.replace(/[\\%_]/g, char => `\\${char}`);

export const schoolRepository = {
  list: ({ status, search } = {}) => {
    const pattern = search && `%${escapeLike(search)}%`;
    return platformDb()
      .select(columns)
      .from(platformTenants)
      .where(
        and(
          status ? eq(platformTenants.status, status) : undefined,
          pattern ? or(ilike(platformTenants.name, pattern), ilike(platformTenants.code, pattern)) : undefined
        )
      )
      .orderBy(desc(platformTenants.createdAt));
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
