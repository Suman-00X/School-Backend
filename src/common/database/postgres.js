import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import env from "../config/env.config.js";
import { logger } from "../logging/logger.js";
import { gauge } from "../observability/metrics.js";

let pool = null;

/* Live binding: repositories read `db` at call time, after initPostgres() */
export let db = null;

/* The app passes in every module's tables (see src/database.schema.js),
   so the framework never imports module code */
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

export const initPostgres = schema => {
  pool = new pg.Pool({ connectionString: env.databaseUrl, max: env.pgPoolMax });
  pool.on("connect", timeQueries);
  /* An idle connection dropped by the server (restart, failover): log it, do not crash.
     The pool replaces the connection on next use. */
  pool.on("error", error => logger.error({ err: error }, "PostgreSQL connection error"));
  db = drizzle({ client: pool, schema });
  return db;
};

gauge("pg_pool_connections", "PostgreSQL pool connections by state", () =>
  pool
    ? [
        { labels: { state: "total" }, value: pool.totalCount },
        { labels: { state: "idle" }, value: pool.idleCount },
        { labels: { state: "waiting" }, value: pool.waitingCount }
      ]
    : undefined
);

export const connectPostgres = async () => {
  const client = await pool.connect();
  client.release();
  logger.info("PostgreSQL connected");
};

export const closePostgres = () => pool?.end();

/* Run fn(tx) in a transaction; every repository method accepts { dbc: tx } */
export const transaction = fn => db.transaction(fn);
