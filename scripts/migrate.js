/* Applies pending PostgreSQL migrations (src/database/postgres/migrations).
   Safe to run on every deploy; already-applied migrations are skipped. */
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closePostgres, db } from "../src/database/postgres/client.js";

const migrationsFolder = path.resolve(import.meta.dirname, "../src/database/postgres/migrations");

await migrate(db, { migrationsFolder });
console.log("PostgreSQL migrations applied");

await closePostgres();
