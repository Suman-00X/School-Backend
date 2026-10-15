import { closeMongo, connectMongo } from "./common/database/mongo.js";
import { closePostgres, connectPostgres, initPostgres } from "./common/database/postgres.js";
import * as schema from "./database.schema.js";

/* Connect both databases (used by the server and the dev scripts) */
export const startDatabases = async () => {
  initPostgres(schema);
  await connectPostgres();
  await connectMongo();
};

export const stopDatabases = () => Promise.allSettled([closePostgres(), closeMongo()]);
