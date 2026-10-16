import { AsyncLocalStorage } from "node:async_hooks";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import mongoose from "mongoose";
import pg from "pg";
import env from "../config/env.config.js";
import { cache } from "../cache/cache.js";
import { decryptField } from "../crypto/fieldEncryption.js";
import { forbidden, notFound } from "../http/errors.js";
import { logger } from "../logging/logger.js";
import { platformTenants } from "./registry.schema.js";

/* Database per school (D-45).

   The platform database (DATABASE_URL) is a registry of schools. Each school's data lives in
   its own PostgreSQL database and its own MongoDB database, so one school's records are
   never in the same database as another's.

   runInTenant(tenantId, fn) runs fn with that school's connections in an AsyncLocalStorage
   context. Everything inside (repositories through `db`, transactions, Mongoose models,
   jobs it enqueues) uses that school's databases without being told. Requests enter it
   after authentication; background jobs by their tenantId. */

const storage = new AsyncLocalStorage();
let tenantSchema = {};
let platform = null;

/* tenantId -> { pool, db, mongo, lastUsed } (least recently used ones are closed) */
const connections = new Map();
const opening = new Map();

/* Time every query on a connection; slow ones are logged with their SQL (never the
   parameter values, which can hold personal data) */
const timeQueries = client => {
  if (client.__timed) return;
  client.__timed = true;
  const query = client.query.bind(client);
  client.query = (...args) => {
    const started = process.hrtime.bigint();
    const result = query(...args);
    if (result && typeof result.then === "function") {
      result.then(
        () => {
          const ms = Number(process.hrtime.bigint() - started) / 1e6;
          if (ms > env.slowQueryMs) {
            const text = typeof args[0] === "string" ? args[0] : args[0]?.text;
            logger.warn({ durationMs: Math.round(ms), sql: String(text ?? "").slice(0, 1000) }, "Slow database query");
          }
        },
        () => {}
      );
    }
    return result;
  };
};

export const initTenancy = schema => {
  tenantSchema = schema;
  if (!platform) {
    const pool = new pg.Pool({ connectionString: env.databaseUrl, max: env.pgPoolMax });
    pool.on("connect", timeQueries);
    pool.on("error", error => logger.error({ err: error }, "Platform database connection error"));
    platform = { pool, db: drizzle({ client: pool }) };
  }
};

export const platformDb = () => {
  if (!platform) throw new Error("Tenancy not initialised: call initTenancy() first");
  return platform.db;
};

/* ---- Registry ---- */

const REGISTRY_TTL_SECONDS = 60;
const registryKey = tenantId => `platform:tenant:${tenantId}`;

export const tenantRecord = tenantId =>
  cache.wrap(registryKey(tenantId), REGISTRY_TTL_SECONDS, async () => {
    const [row] = await platformDb().select().from(platformTenants).where(eq(platformTenants.id, tenantId)).limit(1);
    return row ?? null;
  });

export const tenantRecordByCode = async code => {
  const [row] = await platformDb()
    .select()
    .from(platformTenants)
    .where(eq(platformTenants.code, String(code).trim().toUpperCase()))
    .limit(1);
  return row ?? null;
};

export const listTenantRecords = ({ status } = {}) =>
  platformDb()
    .select()
    .from(platformTenants)
    .where(status ? eq(platformTenants.status, status) : undefined)
    .orderBy(platformTenants.code);

/* Re-read a school's registry entry on next use (e.g. after a rename) */
export const refreshTenantRecord = tenantId => cache.del(registryKey(tenantId));

/* Drop a school's entry and close its connections (suspension, deletion) */
export const forgetTenantRecord = async tenantId => {
  await cache.del(registryKey(tenantId));
  const open = connections.get(tenantId);
  connections.delete(tenantId);
  await closeConnection(open);
};

/* ---- Where a school's data lives ---- */

export const databaseUrlFor = record =>
  record.databaseUrl
    ? decryptField(record.databaseUrl)
    : env.tenancy.databaseUrlTemplate.replace("{database}", record.databaseName);

export const mongoUrlFor = record =>
  record.mongoUrl
    ? decryptField(record.mongoUrl)
    : env.tenancy.mongoUrlTemplate.replace("{database}", record.mongoDatabaseName);

/* ---- Connections ---- */

const closeConnection = async open => {
  if (!open) return;
  await Promise.allSettled([open.pool.end(), open.ownMongo ? open.mongo.close() : null]);
};

const evictIdle = async () => {
  if (connections.size <= env.tenancy.maxOpenTenants) return;
  const oldest = [...connections.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [tenantId, open] of oldest.slice(0, connections.size - env.tenancy.maxOpenTenants)) {
    connections.delete(tenantId);
    await closeConnection(open);
  }
};

const open = async record => {
  const pool = new pg.Pool({
    connectionString: databaseUrlFor(record),
    max: env.tenancy.poolMaxPerTenant,
    idleTimeoutMillis: 30_000
  });
  pool.on("connect", timeQueries);
  pool.on("error", error => logger.error({ err: error, tenantId: record.id }, "School database connection error"));
  /* A school's own MongoDB string gets its own connection; otherwise the shared cluster is reused */
  const ownMongo = Boolean(record.mongoUrl);
  const mongo = ownMongo
    ? await mongoose.createConnection(mongoUrlFor(record), { autoIndex: !env.isProduction }).asPromise()
    : mongoose.connection.useDb(record.mongoDatabaseName, { useCache: true });
  return { pool, db: drizzle({ client: pool, schema: tenantSchema }), mongo, ownMongo, lastUsed: Date.now() };
};

const connectionsFor = async record => {
  const existing = connections.get(record.id);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing;
  }
  if (!opening.has(record.id)) {
    opening.set(
      record.id,
      open(record)
        .then(async opened => {
          connections.set(record.id, opened);
          await evictIdle();
          return opened;
        })
        .finally(() => opening.delete(record.id))
    );
  }
  return opening.get(record.id);
};

/* Run fn inside a school's databases */
export const runInTenant = async (tenantId, fn) => {
  const current = storage.getStore();
  if (current?.tenantId === tenantId) return fn();
  const record = tenantId ? await tenantRecord(tenantId) : null;
  if (!record) throw notFound("School");
  if (record.status !== "ACTIVE") throw forbidden("This school's account is suspended. Please contact support.");
  const { db, mongo } = await connectionsFor(record);
  return storage.run({ tenantId, db, mongo }, fn);
};

export const currentTenantId = () => storage.getStore()?.tenantId ?? null;

const store = () => {
  const current = storage.getStore();
  if (!current) throw new Error("No school context: this code must run inside runInTenant()");
  return current;
};
export const tenantDb = () => store().db;
export const tenantMongo = () => store().mongo;

/* Pools for the metrics gauge */
export const poolStats = () => {
  const pools = [platform?.pool, ...[...connections.values()].map(open => open.pool)].filter(Boolean);
  const total = key => pools.reduce((sum, pool) => sum + pool[key], 0);
  return {
    total: total("totalCount"),
    idle: total("idleCount"),
    waiting: total("waitingCount"),
    schools: connections.size
  };
};

export const closeTenancy = async () => {
  const open = [...connections.values()];
  connections.clear();
  await Promise.allSettled(open.map(closeConnection));
  await platform?.pool.end();
  platform = null;
};
