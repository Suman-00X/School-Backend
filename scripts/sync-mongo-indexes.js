/* Builds every MongoDB schema index and drops indexes no longer declared
   in a schema. Run after deploys that change Mongo indexes. */
import mongoose from "mongoose";
import { closeMongo, connectMongo } from "../src/database/mongo/client.js";
import "../src/database/mongo/models/auditLog.model.js";

await connectMongo();

const result = await mongoose.syncIndexes();
for (const [model, dropped] of Object.entries(result)) {
  console.log(`${model}: synced${dropped?.length ? `, dropped ${dropped.join(", ")}` : ""}`);
}

await closeMongo();
