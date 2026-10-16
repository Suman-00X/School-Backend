import { and, eq } from "drizzle-orm";
import { cache } from "../cache/cache.js";
import { db } from "../database/postgres.js";
import { tenants } from "../database/platform.schema.js";
import { todayIn } from "../utils/date.util.js";

const TTL_SECONDS = 300;
const key = tenantId => `tenant:${tenantId}:profile`;

/* The school's profile (time zone, currency…), cached for 5 minutes */
export const getTenant = tenantId =>
  cache.wrap(key(tenantId), TTL_SECONDS, async () => {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    return tenant ?? null;
  });

/* For sign-in: an active school by its code (case-insensitive), or null */
export const findTenantByCode = async code => {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.code, String(code).trim().toUpperCase()), eq(tenants.isActive, true)))
    .limit(1);
  return tenant ?? null;
};

export const invalidateTenant = tenantId => cache.del(key(tenantId));

/* Update the school's profile and drop the cached copy */
export const updateTenant = async (tenantId, changes) => {
  const [tenant] = await db.update(tenants).set(changes).where(eq(tenants.id, tenantId)).returning();
  await invalidateTenant(tenantId);
  return tenant ?? null;
};

/* Today's date in the school's time zone */
export const tenantToday = async tenantId => todayIn((await getTenant(tenantId))?.timezone ?? "UTC");

/* Valid IANA time zone? */
export const isTimeZone = value => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};
