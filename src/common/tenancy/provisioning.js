import { randomUUID } from "node:crypto";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import env from "../config/env.config.js";
import { encryptField } from "../crypto/fieldEncryption.js";
import { tenants } from "../database/platform.schema.js";
import { conflict, unprocessable } from "../http/errors.js";
import { logger } from "../logging/logger.js";
import { databaseUrlFor, listTenantRecords, platformDb, tenantRecordByCode } from "./context.js";
import { platformTenants } from "./registry.schema.js";

/* Creating and upgrading schools' databases (database per school, D-45). */

const ROOT = path.resolve(import.meta.dirname, "../../..");
export const TENANT_MIGRATIONS = path.join(ROOT, "migrations");
export const PLATFORM_MIGRATIONS = path.join(ROOT, "migrations-platform");

const CODE = /^[A-Z0-9-]{2,20}$/;
export const databaseNameFor = code => `${env.tenancy.databasePrefix}${code.toLowerCase().replace(/-/g, "_")}`;

/* Run a school database's migrations (safe to repeat) */
export const migrateTenantDatabase = async url => {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: TENANT_MIGRATIONS });
  } finally {
    await pool.end();
  }
};

export const migratePlatformDatabase = async () => migrate(platformDb(), { migrationsFolder: PLATFORM_MIGRATIONS });

/* Every registered school, one after another; a failing school is reported and skipped */
export const migrateAllTenants = async () => {
  const results = [];
  for (const record of await listTenantRecords()) {
    try {
      await migrateTenantDatabase(databaseUrlFor(record));
      results.push({ code: record.code, ok: true });
    } catch (error) {
      logger.error({ err: error, tenant: record.code }, "School database migration failed");
      results.push({ code: record.code, ok: false, error: error.message });
    }
  }
  return results;
};

/* CREATE DATABASE on the shared server (an identifier cannot be a query parameter, so the
   name is validated and quoted) */
const createDatabase = async name => {
  if (!/^[a-z0-9_]{1,63}$/.test(name)) throw unprocessable(`Invalid database name ${name}`);
  const client = new pg.Client({ connectionString: env.tenancy.postgresAdminUrl });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!rowCount) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
};

/* A new school: its own databases, migrated, with its profile, registered on the platform.
   databaseUrl / mongoUrl: the school's own connection strings ("bring your own database");
   without them, databases named school_<code> are created on the shared servers.
   details: more of the profile (address, contactEmail, contactPhone, description).
   enabledModules: the modules switched on (see moduleSwitches.js); omitted: every module. */
export const provisionTenant = async ({
  code,
  name,
  timezone,
  currency,
  country,
  details = {},
  enabledModules,
  databaseUrl,
  mongoUrl
}) => {
  const normalised = String(code).trim().toUpperCase();
  if (!CODE.test(normalised)) throw unprocessable("code must be 2-20 letters, digits or dashes");
  if (await tenantRecordByCode(normalised)) throw conflict(`A school with code ${normalised} already exists`);

  const databaseName = databaseNameFor(normalised);
  if (!databaseUrl) await createDatabase(databaseName);
  const url = databaseUrl ?? env.tenancy.databaseUrlTemplate.replace("{database}", databaseName);
  await migrateTenantDatabase(url);

  /* The school's profile row in its own database; reused if a previous attempt got this far */
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  let profile;
  try {
    const schoolDb = drizzle({ client: pool });
    [profile] = await schoolDb.select().from(tenants).where(eq(tenants.code, normalised)).limit(1);
    if (!profile) {
      [profile] = await schoolDb
        .insert(tenants)
        .values({
          id: randomUUID(),
          name: name.trim(),
          code: normalised,
          ...(timezone && { timezone }),
          ...(currency && { currency: currency.toUpperCase() }),
          ...(country && { country: country.toUpperCase() }),
          address: details.address ?? null,
          contactEmail: details.contactEmail ?? null,
          contactPhone: details.contactPhone ?? null,
          description: details.description ?? null
        })
        .returning();
    }
  } finally {
    await pool.end();
  }

  const [record] = await platformDb()
    .insert(platformTenants)
    .values({
      id: profile.id,
      code: normalised,
      name: profile.name,
      databaseName,
      mongoDatabaseName: databaseName,
      databaseUrl: databaseUrl ? encryptField(databaseUrl) : null,
      mongoUrl: mongoUrl ? encryptField(mongoUrl) : null,
      enabledModules: enabledModules ?? null
    })
    .returning();
  logger.info({ tenant: normalised, database: databaseName }, "School provisioned");
  return { record, profile };
};
