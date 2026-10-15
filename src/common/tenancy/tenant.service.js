import { eq } from "drizzle-orm";
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

export const invalidateTenant = tenantId => cache.del(key(tenantId));

/* Today's date in the school's time zone */
export const tenantToday = async tenantId => todayIn((await getTenant(tenantId))?.timezone ?? "UTC");
