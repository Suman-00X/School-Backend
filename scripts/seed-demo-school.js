/* Dev/demo CLI: create a school full of connected demo data on the configured databases
   (DATABASE_URL / MONGO_URI), so the frontend and reviewers have something real to look at.

     npm run school:seed-demo                       # school DEMO, every password Demo12345
     npm run school:seed-demo -- --code SUNRISE --name "Sunrise Public School" --password Secret123

   Every kind of account is created (administrator, principal, accountant, office staff,
   the five module managers, teachers, students and parents) and linked the way a real
   school is: class teachers, subject teachers, siblings sharing parents, boarders, bus riders,
   fees, marks, attendance, loans, payroll… See scripts/lib/demo-school/seed.js.

   The school gets its own databases (school_<code>), like any other; the code must be new.
   For a throwaway copy in memory instead: npm run dev:demo. Refused in production. */
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    code: { type: "string", default: "DEMO" },
    name: { type: "string", default: "Sunrise Public School" },
    password: { type: "string", default: "Demo12345" },
    /* Seeded addresses use a reserved domain, so no mail can ever reach a real inbox */
    domain: { type: "string" },
    timezone: { type: "string", default: "Asia/Kolkata" }
  }
});

const fail = message => {
  console.error(`seed-demo-school: ${message}`);
  process.exit(1);
};
if (process.env.NODE_ENV === "production") fail("refused in production: demo data does not belong there");
if (!/^[A-Z0-9-]{2,20}$/i.test(args.code)) fail("--code must be 2-20 letters, digits or dashes");
if (!(args.password.length >= 8 && /[A-Za-z]/.test(args.password) && /\d/.test(args.password)))
  fail("--password must be at least 8 characters with a letter and a digit");
const domain = args.domain ?? `${args.code.toLowerCase()}.example`;

/* This process is the API the seed talks to: about 1,500 requests from one address, and
   nothing it triggers (announcements, reminders) may email or text the fictional people */
Object.assign(process.env, {
  LOG_LEVEL: process.env.LOG_LEVEL ?? "warn",
  RATE_LIMIT_MAX: "1000000",
  AUTH_RATE_LIMIT_MAX: "1000000",
  EMAIL_DRIVER: "memory",
  SMS_DRIVER: "memory"
});

const { startInfrastructure, stopInfrastructure } = await import("../src/bootstrap.js");
const postgres = await import("../src/common/database/postgres.js");
const { runInTenant } = await import("../src/common/tenancy/context.js");
const { migratePlatformDatabase, provisionTenant } = await import("../src/common/tenancy/provisioning.js");
const { hashPassword } = await import("../src/common/crypto/password.js");
const { users } = await import("../src/database.schema.js");
const { accountDirectory } = await import("../src/modules/users/accounts/index.js");
const { seedDemoSchool } = await import("./lib/demo-school/seed.js");
const { printAccounts, writeAccountsFile } = await import("./lib/demo-school/print.js");

await startInfrastructure({ runJobs: true });
let server;
try {
  await migratePlatformDatabase();
  const { profile: tenant } = await provisionTenant({ code: args.code, name: args.name, timezone: args.timezone });
  const adminEmail = `admin@${domain}`;
  await runInTenant(tenant.id, async () =>
    postgres.db.insert(users).values({
      tenantId: tenant.id,
      firstName: "Asha",
      lastName: "Rao",
      email: adminEmail,
      role: "ADMIN",
      passwordHash: await hashPassword(args.password)
    })
  );
  /* The admin was written directly: list it in the login directory (the seed's accounts are
     created through the API, which lists them itself) */
  await accountDirectory.rebuild(tenant.id);

  const { default: app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));

  console.log(`Seeding ${tenant.name} (${tenant.code})…`);
  const started = Date.now();
  const result = await seedDemoSchool({
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    schoolCode: tenant.code,
    adminEmail,
    password: args.password,
    domain,
    log: console.log
  });
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)}s.\n`);
  const sheet = {
    ...result,
    school: tenant,
    admin: { name: "Asha Rao", email: adminEmail, ...result.admin },
    password: args.password,
    databases: `Databases: school_${args.code.toLowerCase().replace(/-/g, "_")} on the configured servers (npm run school:seed-demo).`
  };
  printAccounts(sheet);
  const file = writeAccountsFile(new URL("../docs/DEMO_ACCOUNTS.md", import.meta.url).pathname, sheet);
  console.log(`Every account with its ids: ${file}`);
} catch (error) {
  if (error.status === 409) fail(`${error.message} (pick another --code)`);
  throw error;
} finally {
  server?.close();
  await stopInfrastructure();
}
