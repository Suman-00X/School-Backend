/* Dev only: run the API against throwaway PostgreSQL + MongoDB, seeded with
   one school and an admin who can sign in.
   Nothing persists after the process exits. Not for production use. */
import { startInMemoryDatabases } from "./lib/inMemoryDatabases.js";

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

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`\nIn-memory dev server: http://localhost:${port}/api/v1`);
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);
  console.log(
    `Sign in: POST /api/v1/auth/login {"schoolCode":"DEMO","email":"admin@demo.school","password":"${DEV_PASSWORD}"}`
  );
});

const shutdown = async () => {
  server.close();
  await stopDatabases();
  await databases.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
