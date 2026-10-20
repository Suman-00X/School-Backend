/* Operator CLI: an account for the onboarding portal (/platform in the web app), where
   schools are created with their first administrator and modules.

     npm run platform:operator -- --email ops@example.com --name "Asha Rao" [--password "…"]

   Without --password a strong one is generated and printed once. Run it again for an
   existing email to set a new password (and re-enable a disabled operator). Runs the platform
   migrations first (safe to repeat). */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    password: { type: "string" }
  }
});

const fail = message => {
  console.error(`create-operator: ${message}`);
  process.exit(1);
};

const email = args.email?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("--email must be an email address");
if (args.password !== undefined && (args.password.length < 12 || args.password.length > 128)) {
  fail("--password must be 12-128 characters");
}
const password = args.password ?? randomBytes(18).toString("base64url");

const { initPostgres, closePostgres } = await import("../src/common/database/postgres.js");
const { migratePlatformDatabase } = await import("../src/common/tenancy/provisioning.js");
const { operatorService } = await import("../src/modules/platform/operators/index.js");
const schema = await import("../src/database.schema.js");

initPostgres(schema);
try {
  await migratePlatformDatabase();
  const existing = await operatorService.setPassword(email, password);
  if (existing) {
    console.log(`Password set for operator ${existing.name} <${existing.email}>`);
  } else {
    if (!args.name?.trim()) fail("--name is required for a new operator");
    const operator = await operatorService.create({ name: args.name.trim(), email, password });
    console.log(`Operator created: ${operator.name} <${operator.email}>, id ${operator.id}`);
  }
  if (!args.password) console.log(`Password (shown once): ${password}`);
  console.log("Sign in at <web app>/platform/sign-in");
} finally {
  await closePostgres();
}
