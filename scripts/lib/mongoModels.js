/* Registers every Mongoose model of the application (by loading the route table and the
   job registry, which import every module) -> [{ model, collection }] */
import mongoose from "mongoose";

export const loadMongoModels = async () => {
  await import("../../src/routes.js");
  await import("../../src/jobs.js");
  const { tenantModelNames, modelOn } = await import("../../src/common/database/mongo.js");
  /* A scratch connection object only to read each model's collection name */
  const probe = mongoose.createConnection();
  return tenantModelNames().map(name => ({ model: name, collection: modelOn(probe, name).collection.collectionName }));
};
