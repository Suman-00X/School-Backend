/* Dev only: run the API against throwaway PostgreSQL + MongoDB, seeded with
   one school and an admin user, and print a token for that admin.
   Nothing persists after the process exits. Not for production use. */
import jwt from "jsonwebtoken";
import { startInMemoryDatabases } from "./lib/inMemoryDatabases.js";

const databases = await startInMemoryDatabases();

process.env.DATABASE_URL = databases.databaseUrl;
process.env.MONGO_URI = databases.mongoUri;
process.env.JWT_SECRET ||= "dev-only-secret";
process.env.NODE_ENV ||= "development";

const { db, connectPostgres, closePostgres } = await import("../src/database/postgres/client.js");
const { connectMongo, closeMongo } = await import("../src/database/mongo/client.js");
const { tenants, users } = await import("../src/database/postgres/schema/index.js");
const { default: app } = await import("../src/app.js");

await connectPostgres();
await connectMongo();

const [tenant] = await db.insert(tenants).values({ name: "Demo School", code: "DEMO" }).returning();
const [admin] = await db
  .insert(users)
  .values({ tenantId: tenant.id, firstName: "Demo", lastName: "Admin", email: "admin@demo.school", role: "ADMIN" })
  .returning();

const token = jwt.sign(
  { userId: admin.id, tenantId: tenant.id, role: "ADMIN" },
  process.env.JWT_SECRET,
  { expiresIn: "12h" }
);

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`\nIn-memory dev server on http://localhost:${port}`);
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`Admin token (12h):\n${token}\n`);
});

const shutdown = async () => {
  server.close();
  await Promise.allSettled([closePostgres(), closeMongo()]);
  await databases.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
