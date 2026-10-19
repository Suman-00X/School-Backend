/* Rebuilds the login directory (platform database: which schools have an account for a
   sign-in email) from the schools' own users tables. Safe to repeat at any time.

     npm run directory:rebuild                 # every active school
     npm run directory:rebuild -- --code GVS   # one school

   Run it after restoring or moving a school's database, after changing
   DATA_ENCRYPTION_KEY (the directory's key is derived from it), or when the logs say
   "Login directory not updated". A school that fails is reported, the others still run;
   exit code 1 then. */
import { parseArgs } from "node:util";
import { closeMongo, connectMongo } from "../src/common/database/mongo.js";
import { closePostgres, initPostgres } from "../src/common/database/postgres.js";
import { tenantRecordByCode } from "../src/common/tenancy/context.js";
import * as schema from "../src/database.schema.js";
import { accountDirectory } from "../src/modules/users/accounts/index.js";

const { values: args } = parseArgs({ options: { code: { type: "string" } } });

initPostgres(schema);
await connectMongo();
try {
  let results;
  if (args.code) {
    const record = await tenantRecordByCode(args.code);
    if (!record) throw new Error(`No school with code ${args.code.toUpperCase()}`);
    results = [{ code: record.code, ok: true, ...(await accountDirectory.rebuild(record.id)) }];
  } else {
    results = await accountDirectory.rebuildAll();
  }
  for (const r of results) {
    console.log(
      `${r.code}: ${r.ok ? `${r.accounts} account(s) listed, ${r.removed} stale row(s) removed` : `FAILED (${r.error})`}`
    );
  }
  console.log(`${results.filter(r => r.ok).length} of ${results.length} school(s) rebuilt`);
  if (results.some(r => !r.ok)) process.exitCode = 1;
} finally {
  await closePostgres();
  await closeMongo();
}
