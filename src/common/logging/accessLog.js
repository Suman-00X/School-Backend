import { mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";
import env from "../config/env.config.js";

/* The access log: one JSON line per HTTP request, for monitoring the API (traffic, latency,
   status codes, payload sizes, database time, rate limits). It is a separate stream from the
   application log (logger.js), which records what the code did and why something failed.

     ACCESS_LOG=file    daily files ACCESS_LOG_DIR/access-YYYY-MM-DD.log (UTC days), older
                        than ACCESS_LOG_RETENTION_DAYS deleted (0 keeps them all)
     ACCESS_LOG=stdout  on stdout next to the application log; every line has log: "access"
                        so the log platform can route it
     ACCESS_LOG=off

   Writes are synchronous: a crash or restart never drops the last requests. */

const FILE = /^access-(\d{4}-\d{2}-\d{2})\.log$/;
const DAY_MS = 86_400_000;
const dayOf = time => new Date(time).toISOString().slice(0, 10);

const dailyFiles = ({ dir, retentionDays }) => {
  mkdirSync(dir, { recursive: true });
  const pathFor = time => join(dir, `access-${dayOf(time)}.log`);
  const prune = () => {
    if (!retentionDays) return;
    const oldest = dayOf(Date.now() - retentionDays * DAY_MS);
    for (const name of readdirSync(dir)) {
      const day = FILE.exec(name)?.[1];
      if (!day || day >= oldest) continue;
      try {
        unlinkSync(join(dir, name));
      } catch {
        /* another instance removed it first */
      }
    }
  };

  const file = pino.destination({ dest: pathFor(Date.now()), sync: true });
  let nextDay = (Math.floor(Date.now() / DAY_MS) + 1) * DAY_MS;
  prune();
  return {
    write: line => {
      const now = Date.now();
      if (now >= nextDay) {
        file.reopen(pathFor(now));
        nextDay = (Math.floor(now / DAY_MS) + 1) * DAY_MS;
        prune();
      }
      file.write(line);
    }
  };
};

const destination = () => {
  const { mode, dir, retentionDays } = env.accessLog;
  if (mode === "off") return null;
  if (mode === "stdout") return pino.destination({ dest: 1, sync: true });
  if (mode === "file") return dailyFiles({ dir, retentionDays });
  throw new Error(`ACCESS_LOG must be file, stdout or off (got "${mode}")`);
};

const stream = destination();

/* null when the access log is off */
export const accessLogger = stream
  ? pino(
      {
        base: { service: "school-backend", env: env.nodeEnv, version: env.appVersion, pid: process.pid },
        timestamp: pino.stdTimeFunctions.isoTime,
        /* Every line is a request: in place of a level, the stream's name */
        formatters: { level: () => ({ log: "access" }) }
      },
      stream
    )
  : null;
