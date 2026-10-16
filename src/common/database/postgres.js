import { sql } from "drizzle-orm";
import { logger } from "../logging/logger.js";
import { gauge } from "../observability/metrics.js";
import { closeTenancy, initTenancy, platformDb, poolStats, tenantDb } from "../tenancy/context.js";

/* PostgreSQL. `db` is the CURRENT SCHOOL's database: a proxy that resolves, on each use,
   to the database of the school whose context the code runs in (see tenancy/context.js).
   Repositories, services and transactions keep using `db` / transaction() unchanged. */
export const db = new Proxy(
  {},
  {
    get: (_, property) => {
      const target = tenantDb();
      const value = target[property];
      return typeof value === "function" ? value.bind(target) : value;
    }
  }
);

/* The app passes in every module's tables (see src/database.schema.js),
   so the framework never imports module code */
export const initPostgres = schema => initTenancy(schema);

gauge("pg_pool_connections", "PostgreSQL pool connections by state (platform + open schools)", () => {
  const stats = poolStats();
  return [
    { labels: { state: "total" }, value: stats.total },
    { labels: { state: "idle" }, value: stats.idle },
    { labels: { state: "waiting" }, value: stats.waiting }
  ];
});
gauge("tenant_databases_open", "Schools whose databases are connected in this process", () => poolStats().schools);

export const connectPostgres = async () => {
  await platformDb().execute(sql`select 1`);
  logger.info("Platform database connected");
};

export const closePostgres = () => closeTenancy();

/* Run fn(tx) in a transaction on the current school's database */
export const transaction = fn => tenantDb().transaction(fn);
