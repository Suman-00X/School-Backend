import env from "../config/env.config.js";
import { logger } from "../logging/logger.js";
import { counter } from "./metrics.js";

/* One place to report unexpected errors (HTTP 500s, jobs that failed for good).
   Always logged and counted. With SENTRY_DSN set and @sentry/node installed,
   also sent to Sentry. Never pass request bodies: they can hold personal data. */

const unexpected = counter("unexpected_errors_total", "Unexpected errors", ["source"]);
let sentry = null;

/* Database errors carry query parameters ("Failed query: … params: Asha,asha@x.in"),
   i.e. personal data. Keep the query shape, drop the values. */
const withoutParams = text => (typeof text === "string" ? text.replace(/params:[\s\S]*/i, "params: [removed]") : text);
const scrub = event => {
  for (const exception of event.exception?.values ?? []) exception.value = withoutParams(exception.value);
  if (event.message) event.message = withoutParams(event.message);
  delete event.request?.data;
  return event;
};

export const initErrorReporting = async () => {
  if (!env.sentryDsn) return;
  try {
    const moduleName = "@sentry/node";
    sentry = await import(moduleName);
    sentry.init({ dsn: env.sentryDsn, environment: env.nodeEnv, sendDefaultPii: false, beforeSend: scrub });
    logger.info("Error reporting to Sentry enabled");
  } catch {
    logger.warn(
      "SENTRY_DSN is set but @sentry/node is not installed (npm install @sentry/node); errors are only logged"
    );
  }
};

/* source: "http" | "job"; context: small, non-personal tags (requestId, tenantId, job) */
export const reportError = (error, { source = "http", ...context } = {}) => {
  unexpected.inc({ source });
  sentry?.withScope(scope => {
    scope.setTags({ source, ...context });
    sentry.captureException(error);
  });
};

export const flushErrorReporting = () => sentry?.flush(2000);
