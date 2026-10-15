/* Dev only: run the API against a throwaway in-memory MongoDB replica set,
   seeded with one school and an admin user, and print a token for that admin.
   Nothing persists after the process exits. Not for production use. */
import { MongoMemoryReplSet } from "mongodb-memory-server";
import jwt from "jsonwebtoken";

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

process.env.MONGO_URI = replSet.getUri("school_dev");
process.env.JWT_SECRET ||= "dev-only-secret";
process.env.NODE_ENV ||= "development";

const { default: mongoose } = await import("mongoose");
const { default: connectDb } = await import("../src/config/db.config.js");
const { Tenant, User } = await import("../src/models/index.js");
const { default: app } = await import("../src/app.js");

await connectDb();
await mongoose.syncIndexes();

const tenant = await Tenant.create({ name: "Demo School", code: "DEMO" });
const admin = await User.create({
  firstName: "Demo",
  lastName: "Admin",
  email: "admin@demo.school",
  passwordHash: "login-arrives-in-phase-1",
  role: "ADMIN",
  tenantId: tenant._id
});

const token = jwt.sign(
  { userId: admin._id, tenantId: tenant._id, role: "ADMIN" },
  process.env.JWT_SECRET,
  { expiresIn: "12h" }
);

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`\nIn-memory dev server on http://localhost:${port}`);
  console.log(`Tenant: ${tenant.name} (${tenant._id})`);
  console.log(`Admin token (12h):\n${token}\n`);
});

const shutdown = async () => {
  server.close();
  await mongoose.disconnect();
  await replSet.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
