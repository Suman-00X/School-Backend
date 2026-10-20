import { AsyncLocalStorage } from "node:async_hooks";

/* Per-request counters that code deep in the stack can add to without being passed the
   request: the access log reads them when the response closes. Outside a request
   (jobs, scripts) there is no store and recording is a no-op. */

const storage = new AsyncLocalStorage();

export const newRequestStats = () => ({
  postgres: { queries: 0, ms: 0 },
  mongo: { queries: 0, ms: 0 }
});

/* Run fn (the rest of the middleware chain) with stats as the current request's counters */
export const trackRequest = (stats, fn) => storage.run(stats, fn);

/* Start timing one database call; the returned stop() adds it to the request that started
   it (even when it settles in another async context) and returns its duration in ms */
export const dbTimer = database => {
  const stats = storage.getStore();
  const started = process.hrtime.bigint();
  return () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const counters = stats?.[database];
    if (counters) {
      counters.queries += 1;
      counters.ms += ms;
    }
    return ms;
  };
};
