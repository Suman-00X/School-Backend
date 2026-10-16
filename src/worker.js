import { logger } from "./common/logging/logger.js";
import { startInfrastructure, stopInfrastructure } from "./bootstrap.js";
import { installProcessGuards } from "./common/observability/processGuards.js";

installProcessGuards("worker");

/* Background worker: processes queued jobs and schedules (requires REDIS_URL).
   Run one or more next to the API: `npm run worker`. */
if (!process.env.REDIS_URL) {
  logger.error("The worker needs REDIS_URL. Without Redis, the API process runs jobs itself.");
  process.exit(1);
}

await startInfrastructure({ runJobs: true });
logger.info("Worker started");

const shutdown = async signal => {
  logger.info({ signal }, "Worker shutting down");
  await stopInfrastructure();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
