/* Applies pending migrations: the platform database (school registry), then every
   school's own database. Safe to run on every deploy; applied migrations are skipped.
   A school whose migration fails is reported, the others still run; exit code 1 then. */
import { closePostgres, initPostgres } from "../src/common/database/postgres.js";
import { migrateAllTenants, migratePlatformDatabase } from "../src/common/tenancy/provisioning.js";
import * as schema from "../src/database.schema.js";

initPostgres(schema);
try {
  await migratePlatformDatabase();
  console.log("Platform database migrated");
  const results = await migrateAllTenants();
  for (const result of results) console.log(`${result.code}: ${result.ok ? "migrated" : `FAILED (${result.error})`}`);
  console.log(`${results.filter(r => r.ok).length} of ${results.length} school database(s) migrated`);
  if (results.some(r => !r.ok)) process.exitCode = 1;
} finally {
  await closePostgres();
}
