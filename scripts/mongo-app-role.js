/* Least-privilege MongoDB role for the application's database user, covering every
   school's database (database per school) or one named database.

     MONGO_ADMIN_URI=mongodb://admin:…@host/admin npm run mongo:app-role -- --all \
       [--user school_app --password …] [--dry-run]
     npm run mongo:app-role -- --db school_gvs --dry-run

   MongoDB Atlas does not allow createRole through the driver: run with --dry-run and
   create the custom role with the printed privileges in Atlas (Database Access).

   The role can read and write every collection the application uses, except that
   report_snapshots (published report cards) is insert + read only: not even the
   application's own credentials can change or delete a published report card.
   (Seals detect anything done with other credentials; see DECISIONS D-10.)
   Run it again after adding a school or a collection: it updates the role in place. */
import { parseArgs } from "node:util";
import mongoose from "mongoose";

const { values: args } = parseArgs({
  options: {
    db: { type: "string" },
    all: { type: "boolean", default: false },
    role: { type: "string", default: "school_app" },
    user: { type: "string" },
    password: { type: "string" },
    "dry-run": { type: "boolean", default: false }
  }
});

const fail = message => {
  console.error(`mongo-app-role: ${message}`);
  process.exit(1);
};
if (!args.db && !args.all) fail("--db <database> or --all (every registered school) is required");
if (args.user && !args.password) fail("--password is required with --user");

/* The models need configuration to load; nothing connects with it */
process.env.DATABASE_URL ||= "postgres://unused@localhost/unused";
process.env.MONGO_URI ||= "mongodb://localhost/unused";
process.env.JWT_SECRET ||= "unused";
process.env.LOG_LEVEL = "silent";
const { loadMongoModels } = await import("./lib/mongoModels.js");

const WRITE_ONCE = new Set(["report_snapshots"]);
const FULL = ["find", "insert", "update", "remove", "createIndex", "dropIndex", "listIndexes", "collStats"];
const INSERT_ONLY = ["find", "insert", "createIndex", "listIndexes", "collStats"];

const collections = [...new Set((await loadMongoModels()).map(m => m.collection))].sort();

/* Which databases: one, or every school's from the platform registry */
const databases = args.db
  ? [args.db]
  : await (async () => {
      const schema = await import("../src/database.schema.js");
      const { initPostgres, closePostgres } = await import("../src/common/database/postgres.js");
      const { listTenantRecords } = await import("../src/common/tenancy/context.js");
      initPostgres(schema);
      try {
        return (await listTenantRecords()).filter(r => !r.mongoUrl).map(r => r.mongoDatabaseName);
      } finally {
        await closePostgres();
      }
    })();
if (!databases.length) fail("no school databases to cover");

const privileges = databases.flatMap(db => [
  { resource: { db, collection: "" }, actions: ["listCollections", "createCollection"] },
  ...collections.map(collection => ({
    resource: { db, collection },
    actions: WRITE_ONCE.has(collection) ? INSERT_ONLY : FULL
  }))
]);

if (args["dry-run"]) {
  console.log(JSON.stringify({ role: args.role, databases, privileges }, null, 2));
  process.exit(0);
}

const uri = process.env.MONGO_ADMIN_URI;
if (!uri) fail("MONGO_ADMIN_URI (a user allowed to manage roles) is required");
const connection = await mongoose.createConnection(uri).asPromise();
/* A role covering several databases lives in the admin database */
const target = connection.useDb("admin").db;

const exists = (await target.command({ rolesInfo: args.role })).roles.length > 0;
await target.command(
  exists ? { updateRole: args.role, privileges, roles: [] } : { createRole: args.role, privileges, roles: [] }
);
console.log(
  `Role ${args.role} ${exists ? "updated" : "created"}: ${databases.length} school database(s), ${collections.length} collections each, report_snapshots insert-only`
);

if (args.user) {
  const userExists = (await target.command({ usersInfo: args.user })).users.length > 0;
  await target.command(
    userExists
      ? { updateUser: args.user, pwd: args.password, roles: [{ role: args.role, db: "admin" }] }
      : { createUser: args.user, pwd: args.password, roles: [{ role: args.role, db: "admin" }] }
  );
  console.log(`User ${args.user} ${userExists ? "updated" : "created"} with role ${args.role}`);
}
await connection.close();
