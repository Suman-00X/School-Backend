import { randomUUID } from "node:crypto";

/* In-process job runner with retries and delays. Jobs are lost on restart,
   so production with more than one instance should set REDIS_URL. */
export const createMemoryDriver = () => {
  let definitions = new Map();
  let log = console;
  let running = 0;
  const pending = new Set();
  const timers = new Set();
  const seenIds = new Set();
  let idleWaiters = [];

  const settleIfIdle = () => {
    if (running === 0 && pending.size === 0) {
      idleWaiters.forEach(resolve => resolve());
      idleWaiters = [];
    }
  };

  const run = async (name, data, attempt, definition) => {
    running++;
    try {
      await definition.handler(data, { attempt, jobName: name });
    } catch (error) {
      if (attempt < definition.attempts) {
        schedule(name, data, attempt + 1, definition, Math.min(definition.backoffMs, 50) * attempt);
      } else {
        log.error({ err: error, job: name }, "Job failed permanently");
      }
    } finally {
      running--;
      settleIfIdle();
    }
  };

  const schedule = (name, data, attempt, definition, delayMs = 0) => {
    const token = {};
    pending.add(token);
    const timer = setTimeout(() => {
      timers.delete(timer);
      pending.delete(token);
      run(name, data, attempt, definition);
    }, delayMs);
    timers.add(timer);
  };

  return {
    name: "memory",

    add: async (name, data, { delayMs = 0, jobId, definition }) => {
      if (jobId) {
        if (seenIds.has(jobId)) return { id: jobId, duplicate: true };
        seenIds.add(jobId);
      }
      schedule(name, data, 1, definition, delayMs);
      return { id: jobId ?? randomUUID() };
    },

    startWorker: async (defs, schedules, { logger, runSchedules }) => {
      definitions = defs;
      log = logger;
      if (!runSchedules) return;
      for (const [id, { jobName, everyMs, data }] of schedules) {
        if (!everyMs) continue;
        const timer = setInterval(() => {
          const definition = definitions.get(jobName);
          if (definition) schedule(jobName, data, 1, definition);
        }, everyMs);
        timer.unref();
        timers.add(timer);
        log.info({ schedule: id, everyMs }, "Schedule registered");
      }
    },

    drain: () =>
      new Promise(resolve => {
        if (running === 0 && pending.size === 0) return resolve();
        idleWaiters.push(resolve);
      }),

    stop: async () => {
      timers.forEach(timer => clearTimeout(timer));
      timers.clear();
    }
  };
};
