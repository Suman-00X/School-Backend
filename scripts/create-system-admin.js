/* System admin CLI: an account for the admin console (/adminConsole in the web app), where
   the platform's owners onboard schools (tenants) with their first administrator and modules.

     npm run platform:admin -- --email owner@example.com --name "Asha Rao" [--password "…"]

   Without --password a strong one is generated and printed once. Run it again for an
   existing email to set a new password (this also signs that admin out everywhere and
   re-enables a disabled admin). Runs the platform migrations first (safe to repeat). */
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
  console.error(`create-system-admin: ${message}`);
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
const { systemAdminService } = await import("../src/modules/platform/system-admins/index.js");
const schema = await import("../src/database.schema.js");

initPostgres(schema);
try {
  await migratePlatformDatabase();
  const existing = await systemAdminService.setPassword(email, password);
  if (existing) {
    console.log(`Password set for system admin ${existing.name} <${existing.email}>`);
  } else {
    if (!args.name?.trim()) fail("--name is required for a new system admin");
    const admin = await systemAdminService.create({ name: args.name.trim(), email, password });
    console.log(`System admin created: ${admin.name} <${admin.email}>, id ${admin.id}`);
  }
  if (!args.password) console.log(`Password (shown once): ${password}`);
  console.log("Sign in at <web app>/adminConsole");
} finally {
  await closePostgres();
}
