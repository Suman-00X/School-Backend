/* Dev only: run the API against throwaway PostgreSQL + MongoDB, seeded with
   one school and an admin who can sign in.
   With --seed (npm run dev:demo) the school is also filled with demo data: every kind of
   user, linked, with a term's worth of records (see scripts/lib/demo-school/seed.js).
   Nothing persists after the process exits. Not for production use. */
import { startInMemoryDatabases } from "./lib/inMemoryDatabases.js";

const seed = process.argv.includes("--seed");
if (seed)
  /* The seed sends ~1,500 requests from this machine; this throwaway server keeps the higher
     limits, and logs warnings only unless LOG_LEVEL says otherwise */
  Object.assign(process.env, {
    LOG_LEVEL: process.env.LOG_LEVEL ?? "warn",
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX ?? "1000000",
    AUTH_RATE_LIMIT_MAX: process.env.AUTH_RATE_LIMIT_MAX ?? "1000000",
    EMAIL_DRIVER: process.env.EMAIL_DRIVER ?? "memory",
    SMS_DRIVER: process.env.SMS_DRIVER ?? "memory"
  });

const databases = await startInMemoryDatabases();

process.env.DATABASE_URL = databases.databaseUrl;
process.env.POSTGRES_ADMIN_URL = databases.adminUrl;
process.env.MONGO_URI = databases.mongoUri;
process.env.JWT_SECRET ||= "dev-only-secret";
process.env.NODE_ENV ||= "development";

const { startDatabases, stopDatabases } = await import("../src/bootstrap.js");
const postgres = await import("../src/common/database/postgres.js");
const { runInTenant } = await import("../src/common/tenancy/context.js");
const { migratePlatformDatabase, provisionTenant } = await import("../src/common/tenancy/provisioning.js");
const { users } = await import("../src/database.schema.js");
const { hashPassword } = await import("../src/common/crypto/password.js");
const { accountDirectory } = await import("../src/modules/users/accounts/index.js");
const DEV_PASSWORD = "Admin12345";
const { default: app } = await import("../src/app.js");

await startDatabases();
await migratePlatformDatabase();
/* A demo school with its own databases (school_demo), like production */
const { profile: tenant } = await provisionTenant({ code: "DEMO", name: "Demo School" });
await runInTenant(tenant.id, async () =>
  postgres.db.insert(users).values({
    tenantId: tenant.id,
    firstName: "Demo",
    lastName: "Admin",
    email: "admin@demo.school",
    role: "ADMIN",
    passwordHash: await hashPassword(DEV_PASSWORD)
  })
);
/* Sign-in by email finds the school through the login directory */
await accountDirectory.rebuildAll();

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port);
await new Promise(resolve => server.once("listening", resolve));
console.log(`\nIn-memory dev server: http://localhost:${port}/api/v1`);
console.log(`Tenant: ${tenant.name} (${tenant.id})`);
if (seed) {
  const { seedDemoSchool } = await import("./lib/demo-school/seed.js");
  const { printAccounts, writeAccountsFile } = await import("./lib/demo-school/print.js");
  console.log("Seeding demo data…");
  const result = await seedDemoSchool({
    baseUrl: `http://127.0.0.1:${port}`,
    schoolCode: tenant.code,
    adminEmail: "admin@demo.school",
    password: DEV_PASSWORD,
    domain: "demo.school",
    log: console.log
  });
  const sheet = {
    ...result,
    school: tenant,
    admin: { name: "Demo Admin", email: "admin@demo.school", ...result.admin },
    password: DEV_PASSWORD,
    databases: "In-memory databases (npm run dev:demo): the accounts exist only while that server runs."
  };
  console.log("");
  printAccounts(sheet);
  const file = writeAccountsFile(new URL("../docs/DEMO_ACCOUNTS.md", import.meta.url).pathname, sheet);
  console.log(`Every account with its ids: ${file}`);
} else console.log(`Sign in: POST /api/v1/auth/login {"email":"admin@demo.school","password":"${DEV_PASSWORD}"}`);

const shutdown = async () => {
  server.close();
  await stopDatabases();
  await databases.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
