import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const QUEUE = "school-jobs";

/* Durable jobs on Redis: survive restarts, shared by every API instance,
   processed by the worker process */
export const createBullDriver = redisUrl => {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE, { connection });
  let worker = null;

  return {
    name: "bullmq",

    add: (name, data, { delayMs, jobId, definition }) =>
      queue.add(name, data, {
        delay: delayMs,
        jobId,
        attempts: definition.attempts,
        backoff: { type: "exponential", delay: definition.backoffMs },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 }
      }),

    startWorker: async (definitions, schedules, { logger, runSchedules }) => {
      worker = new Worker(
        QUEUE,
        async job => {
          const definition = definitions.get(job.name);
          if (!definition) throw new Error(`No handler for job "${job.name}"`);
          return definition.handler(job.data, { attempt: job.attemptsMade + 1, jobName: job.name });
        },
        { connection: new IORedis(redisUrl, { maxRetriesPerRequest: null }), concurrency: 5 }
      );
      worker.on("failed", (job, error) =>
        logger.error({ err: error, job: job?.name, attempt: job?.attemptsMade }, "Job failed")
      );

      if (!runSchedules) return;
      for (const [id, { jobName, everyMs, cron, data }] of schedules) {
        await queue.upsertJobScheduler(id, cron ? { pattern: cron } : { every: everyMs }, { name: jobName, data });
        logger.info({ schedule: id, cron, everyMs }, "Schedule registered");
      }
    },

    stop: async () => {
      await worker?.close();
      await queue.close();
      await connection.quit();
    }
  };
};
