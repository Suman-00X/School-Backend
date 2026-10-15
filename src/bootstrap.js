import { closeMongo, connectMongo } from "./common/database/mongo.js";
import { closePostgres, connectPostgres, initPostgres } from "./common/database/postgres.js";
import { closeCache, initCache } from "./common/cache/cache.js";
import { startJobs, stopJobs } from "./common/jobs/queue.js";
import * as schema from "./database.schema.js";
import "./jobs.js";

/* Start infrastructure for the API or the worker.
   runJobs: process background jobs in this process. With Redis, only the
   worker does; without Redis the API runs them in-process. */
export const startInfrastructure = async ({ runJobs = !process.env.REDIS_URL } = {}) => {
  initPostgres(schema);
  await connectPostgres();
  await connectMongo();
  await initCache();
  await startJobs({ worker: runJobs });
};

export const stopInfrastructure = async () => {
  await stopJobs();
  await Promise.allSettled([closePostgres(), closeMongo(), closeCache()]);
};

/* Backwards-compatible names used by scripts */
export const startDatabases = startInfrastructure;
export const stopDatabases = stopInfrastructure;
