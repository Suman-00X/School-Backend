/* Least-privilege MongoDB role for the application's database user.

     MONGO_ADMIN_URI=mongodb://admin:…@host/admin npm run mongo:app-role -- --db school \
       [--user school_app --password …] [--dry-run]

   The role can read and write every collection the application uses, except that
   report_snapshots (published report cards) is insert + read only: not even the
   application's own credentials can change or delete a published report card.
   (Seals detect anything done with other credentials; see DECISIONS D-10.)
   Run it again after adding a collection: it updates the role in place. */
import { parseArgs } from "node:util";
import mongoose from "mongoose";

const { values: args } = parseArgs({
  options: {
    db: { type: "string" },
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
if (!args.db) fail("--db is required (the application's database name)");
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
const privileges = [
  { resource: { db: args.db, collection: "" }, actions: ["listCollections", "createCollection"] },
  ...collections.map(collection => ({
    resource: { db: args.db, collection },
    actions: WRITE_ONCE.has(collection) ? INSERT_ONLY : FULL
  }))
];

if (args["dry-run"]) {
  console.log(JSON.stringify({ role: args.role, db: args.db, privileges }, null, 2));
  process.exit(0);
}

const uri = process.env.MONGO_ADMIN_URI;
if (!uri) fail("MONGO_ADMIN_URI (a user allowed to manage roles) is required");
const connection = await mongoose.createConnection(uri).asPromise();
const target = connection.useDb(args.db).db;

const exists = (await target.command({ rolesInfo: args.role })).roles.length > 0;
await target.command(
  exists ? { updateRole: args.role, privileges, roles: [] } : { createRole: args.role, privileges, roles: [] }
);
console.log(
  `Role ${args.role} ${exists ? "updated" : "created"} on ${args.db}: ${collections.length} collections, report_snapshots insert-only`
);

if (args.user) {
  const userExists = (await target.command({ usersInfo: args.user })).users.length > 0;
  await target.command(
    userExists
      ? { updateUser: args.user, pwd: args.password, roles: [{ role: args.role, db: args.db }] }
      : { createUser: args.user, pwd: args.password, roles: [{ role: args.role, db: args.db }] }
  );
  console.log(`User ${args.user} ${userExists ? "updated" : "created"} with role ${args.role}`);
}
await connection.close();
