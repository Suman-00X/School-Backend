/* Builds every MongoDB schema index and drops indexes no longer declared
   in a schema. Run after deploys that change Mongo indexes. */
import mongoose from "mongoose";
import { closeMongo, connectMongo } from "../src/common/database/mongo.js";
import "../src/common/audit/auditLog.model.js";
/* Its unique (student, version) index guards published report cards */
import "../src/modules/academics/report-cards/models/reportSnapshot.model.js";

await connectMongo();

const result = await mongoose.syncIndexes();
for (const [model, dropped] of Object.entries(result)) {
  console.log(`${model}: synced${dropped?.length ? `, dropped ${dropped.join(", ")}` : ""}`);
}

await closeMongo();
