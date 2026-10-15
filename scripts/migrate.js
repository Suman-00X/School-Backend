/* Applies pending PostgreSQL migrations (./migrations).
   Safe to run on every deploy; already-applied migrations are skipped. */
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closePostgres, initPostgres } from "../src/common/database/postgres.js";

const migrationsFolder = path.resolve(import.meta.dirname, "../migrations");

await migrate(initPostgres({}), { migrationsFolder });
console.log("PostgreSQL migrations applied");

await closePostgres();
