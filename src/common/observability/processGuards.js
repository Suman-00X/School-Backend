import { logger } from "../logging/logger.js";
import { flushErrorReporting, reportError } from "./errorReporter.js";

/* Last-resort handlers for the API and the worker: an unexpected error outside a request
   or job is logged with its stack and reported. An uncaught exception leaves the process
   in an unknown state, so it exits (the orchestrator restarts it); a stray rejected
   promise is logged and the process keeps serving. */
export const installProcessGuards = processName => {
  process.on("unhandledRejection", reason => {
    logger.error({ err: reason, process: processName }, "Unhandled promise rejection");
    reportError(reason instanceof Error ? reason : new Error(String(reason)), { source: "process" });
  });
  process.on("uncaughtException", async error => {
    logger.fatal({ err: error, process: processName }, "Uncaught exception; exiting");
    reportError(error, { source: "process" });
    await flushErrorReporting();
    process.exit(1);
  });
};
