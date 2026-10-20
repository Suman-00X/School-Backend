import { eq } from "drizzle-orm";
import { cache } from "../cache/cache.js";
import { db } from "../database/postgres.js";
import { tenants } from "../database/platform.schema.js";
import { timeIn, todayIn } from "../utils/date.util.js";
import { platformDb, refreshTenantRecord, tenantRecord, tenantRecordByCode } from "./context.js";
import { platformTenants } from "./registry.schema.js";

const TTL_SECONDS = 300;
const key = tenantId => `tenant:${tenantId}:profile`;

/* The school's profile (time zone, currency…), cached for 5 minutes */
export const getTenant = tenantId =>
  cache.wrap(key(tenantId), TTL_SECONDS, async () => {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    return tenant ?? null;
  });

/* For sign-in (no school context yet): an active school by its code or id, from the
   platform registry -> { id, code, name } or null */
const signInView = record =>
  record?.status === "ACTIVE" ? { id: record.id, code: record.code, name: record.name } : null;

export const findTenantByCode = async code => signInView(await tenantRecordByCode(code));

export const findTenantById = async id => signInView(await tenantRecord(id));

export const invalidateTenant = tenantId => cache.del(key(tenantId));

/* Update the school's profile and drop the cached copy; the registry keeps its name */
export const updateTenant = async (tenantId, changes) => {
  const [tenant] = await db.update(tenants).set(changes).where(eq(tenants.id, tenantId)).returning();
  await invalidateTenant(tenantId);
  if (tenant && changes.name) {
    await platformDb().update(platformTenants).set({ name: tenant.name }).where(eq(platformTenants.id, tenantId));
    await refreshTenantRecord(tenantId);
  }
  return tenant ?? null;
};

/* Today's date in the school's time zone */
export const tenantToday = async tenantId => todayIn((await getTenant(tenantId))?.timezone ?? "UTC");

/* Today's date and the time now in the school's time zone -> { date, time: "09:05:00" } */
export const tenantNow = async tenantId => {
  const timeZone = (await getTenant(tenantId))?.timezone ?? "UTC";
  return { date: todayIn(timeZone), time: timeIn(timeZone) };
};

/* Valid IANA time zone? */
export const isTimeZone = value => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};
