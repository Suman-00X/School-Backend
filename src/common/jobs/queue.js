import env from "../config/env.config.js";
import { logger } from "../logging/logger.js";
import { createMemoryDriver } from "./memory.driver.js";

/* Background jobs.

     export const sendEmailJob = defineJob("communication.sendEmail", async (data, { attempt }) => { ... });
     await sendEmailJob.enqueue({ to, subject });

   With REDIS_URL, jobs go to BullMQ and run in the worker process (src/worker.js).
   Without it, an in-process driver runs them in the API process (dev, tests, single instance).
   Handlers must be idempotent: a job can run more than once after a failure. */

const definitions = new Map();
const schedules = new Map();
let driver = null;

export const defineJob = (name, handler, { attempts = 3, backoffMs = 5000 } = {}) => {
  if (definitions.has(name)) throw new Error(`Job "${name}" is already defined`);
  definitions.set(name, { handler, attempts, backoffMs });
  return { name, enqueue: (data, options) => enqueue(name, data, options) };
};

/* Recurring job. `cron` is used with Redis (BullMQ); `everyMs` in-process. */
export const defineSchedule = (id, { job, everyMs, cron, data = {} }) => {
  schedules.set(id, { jobName: job.name, everyMs, cron, data });
};

const getDriver = () => {
  if (!driver) throw new Error("Jobs not started: call startJobs() first");
  return driver;
};

export const enqueue = (name, data = {}, options = {}) => {
  if (!definitions.has(name)) throw new Error(`Unknown job "${name}"`);
  return getDriver().add(name, data, { ...options, definition: definitions.get(name) });
};

/* worker: run handlers in this process (API in memory mode, or src/worker.js) */
export const startJobs = async ({ worker = true } = {}) => {
  if (driver) return driver;
  if (env.redisUrl) {
    const { createBullDriver } = await import("./bullmq.driver.js");
    driver = createBullDriver(env.redisUrl);
  } else {
    driver = createMemoryDriver();
  }
  if (worker) await driver.startWorker(definitions, schedules, { logger, runSchedules: !env.isTest });
  logger.info({ driver: driver.name, worker }, "Jobs started");
  return driver;
};

export const stopJobs = async () => {
  await driver?.stop();
  driver = null;
};

/* Tests: wait until every queued job has finished (in-process driver only) */
export const drainJobs = () => getDriver().drain?.();

export const jobsDriverName = () => driver?.name;
