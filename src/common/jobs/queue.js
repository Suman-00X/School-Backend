import env from "../config/env.config.js";
import { logger } from "../logging/logger.js";
import { reportError } from "../observability/errorReporter.js";
import { counter, histogram } from "../observability/metrics.js";
import { currentTenantId, listTenantRecords, runInTenant } from "../tenancy/context.js";
import { moduleOnFor, switchOf } from "../tenancy/moduleSwitches.js";
import { createMemoryDriver } from "./memory.driver.js";

/* Background jobs.

     export const sendEmailJob = defineJob("communication.sendEmail", async (data, { attempt }) => { ... });
     await sendEmailJob.enqueue({ to, subject });

   With REDIS_URL, jobs go to BullMQ and run in the worker process (src/worker.js).
   Without it, an in-process driver runs them in the API process (dev, tests, single instance).
   Handlers must be idempotent: a job can run more than once after a failure.

   Database per school: a job runs inside its school's databases (data.tenantId). enqueue()
   stamps the current school onto the job when the caller does not. A schedule runs its job
   once per active school (see defineSchedule). */

const definitions = new Map();
const schedules = new Map();
let driver = null;

const jobRuns = counter("jobs_total", "Job attempts by outcome", ["job", "outcome"]);
const jobDuration = histogram("job_duration_seconds", "Job attempt duration", ["job"]);

/* Every attempt is measured; a job that fails its last attempt is reported */
const instrument = (name, handler, attempts) => async (data, info) => {
  const start = process.hrtime.bigint();
  try {
    const run = () => handler(data, info);
    const result = await (data?.tenantId ? runInTenant(data.tenantId, run) : run());
    jobRuns.inc({ job: name, outcome: "completed" });
    return result;
  } catch (error) {
    const final = info.attempt >= attempts;
    jobRuns.inc({ job: name, outcome: final ? "failed" : "retried" });
    const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    logger[final ? "error" : "warn"](
      { err: error, job: name, attempt: info.attempt, of: attempts, tenantId: data?.tenantId, durationMs },
      final ? `Job ${name} failed for good` : `Job ${name} failed; will retry`
    );
    if (final) reportError(error, { source: "job", job: name, tenantId: data?.tenantId });
    throw error;
  } finally {
    jobDuration.observe({ job: name }, Number(process.hrtime.bigint() - start) / 1e9);
  }
};

export const defineJob = (name, handler, { attempts = 3, backoffMs = 5000 } = {}) => {
  if (definitions.has(name)) throw new Error(`Job "${name}" is already defined`);
  definitions.set(name, { handler: instrument(name, handler, attempts), attempts, backoffMs });
  return { name, enqueue: (data, options) => enqueue(name, data, options) };
};

/* Recurring job. `cron` is used with Redis (BullMQ); `everyMs` in-process.
   perTenant (default): each run enqueues the job once for every active school, each in its
   own databases; false: once, with no school (platform-level work). */
export const defineSchedule = (id, { job, everyMs, cron, data = {}, perTenant = true }) => {
  if (!perTenant) {
    schedules.set(id, { jobName: job.name, everyMs, cron, data });
    return;
  }
  const fanOut = `schedule:${id}`;
  if (!definitions.has(fanOut)) {
    defineJob(
      fanOut,
      async () => {
        /* Not in schools that have the job's module switched off */
        const module = switchOf({ key: job.name, module: job.name.split(".")[0] });
        for (const school of await listTenantRecords({ status: "ACTIVE" })) {
          if (!moduleOnFor(school, module)) continue;
          await enqueue(job.name, { ...data, tenantId: school.id });
        }
      },
      { attempts: 3 }
    );
  }
  schedules.set(id, { jobName: fanOut, everyMs, cron, data: {} });
};

const getDriver = () => {
  if (!driver) throw new Error("Jobs not started: call startJobs() first");
  return driver;
};

export const enqueue = (name, data = {}, options = {}) => {
  if (!definitions.has(name)) throw new Error(`Unknown job "${name}"`);
  const tenantId = data?.tenantId ?? currentTenantId();
  const payload = tenantId ? { ...data, tenantId } : data;
  return getDriver().add(name, payload, { ...options, definition: definitions.get(name) });
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
