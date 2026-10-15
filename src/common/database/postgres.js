import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import env from "../config/env.config.js";
import { logger } from "../logging/logger.js";

let pool = null;

/* Live binding: repositories read `db` at call time, after initPostgres() */
export let db = null;

/* The app passes in every module's tables (see src/database.schema.js),
   so the framework never imports module code */
export const initPostgres = schema => {
  pool = new pg.Pool({ connectionString: env.databaseUrl, max: env.pgPoolMax });
  db = drizzle({ client: pool, schema });
  return db;
};

export const connectPostgres = async () => {
  const client = await pool.connect();
  client.release();
  logger.info("PostgreSQL connected");
};

export const closePostgres = () => pool?.end();

/* Run fn(tx) in a transaction; every repository method accepts { dbc: tx } */
export const transaction = fn => db.transaction(fn);
