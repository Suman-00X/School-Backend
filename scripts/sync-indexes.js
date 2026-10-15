/* Builds every schema index (unique constraints included) and drops indexes
   no longer declared in a schema. Run after deploys that change indexes. */
import mongoose from "mongoose";
import connectDb from "../src/config/db.config.js";
import "../src/models/index.js";

await connectDb();

const result = await mongoose.syncIndexes();
for (const [model, dropped] of Object.entries(result)) {
  console.log(`${model}: synced${dropped?.length ? `, dropped ${dropped.join(", ")}` : ""}`);
}

await mongoose.disconnect();
