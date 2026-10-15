import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import env from "../../config/env.config.js";
import * as schema from "./schema/index.js";

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: env.pgPoolMax
});

/* Pass `tx` from db.transaction() wherever a query accepts `dbc` */
export const db = drizzle({ client: pool, schema });

export const connectPostgres = async () => {
  const client = await pool.connect();
  client.release();
  console.log("PostgreSQL connected");
};

export const closePostgres = () => pool.end();
