/* Builds every MongoDB schema index in every school's database, and drops indexes no
   longer declared in a schema. Run after deploys that change Mongo indexes. */
import { closeMongo, connectMongo, modelsOn } from "../src/common/database/mongo.js";
import { closePostgres, initPostgres } from "../src/common/database/postgres.js";
import { listTenantRecords, runInTenant, tenantMongo } from "../src/common/tenancy/context.js";
import * as schema from "../src/database.schema.js";
import { loadMongoModels } from "./lib/mongoModels.js";

await loadMongoModels();
initPostgres(schema);
await connectMongo();
try {
  for (const school of await listTenantRecords()) {
    await runInTenant(school.id, async () => {
      for (const model of modelsOn(tenantMongo())) {
        const dropped = await model.syncIndexes();
        console.log(
          `${school.code} ${model.modelName}: synced${dropped?.length ? `, dropped ${dropped.join(", ")}` : ""}`
        );
      }
    });
  }
} finally {
  await closeMongo();
  await closePostgres();
}
