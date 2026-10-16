/* For backup/restore scripts: one line per database set, tab-separated:
     <name>\t<postgres url>\t<mongo url or empty>
   "platform" first, then every school by code. URLs include credentials: this output is
   only ever piped into the backup script, never stored. */
import { closePostgres, initPostgres } from "../src/common/database/postgres.js";
import env from "../src/common/config/env.config.js";
import { databaseUrlFor, listTenantRecords, mongoUrlFor } from "../src/common/tenancy/context.js";
import * as schema from "../src/database.schema.js";

initPostgres(schema);
try {
  const lines = [["platform", env.databaseUrl, ""]];
  for (const school of await listTenantRecords()) lines.push([school.code, databaseUrlFor(school), mongoUrlFor(school)]);
  process.stdout.write(`${lines.map(line => line.join("\t")).join("\n")}\n`);
} finally {
  await closePostgres();
}
