/* Registers every Mongoose model of the application (by loading the route table and the
   job registry, which import every module) -> [{ model, collection }] */
import mongoose from "mongoose";

export const loadMongoModels = async () => {
  await import("../../src/routes.js");
  await import("../../src/jobs.js");
  return mongoose
    .modelNames()
    .map(name => ({ model: name, collection: mongoose.model(name).collection.collectionName }));
};
