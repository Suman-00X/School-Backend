import env from "../config/env.config.js";
import { newRequestStats, trackRequest } from "../observability/requestStats.js";
import { accessLogger } from "./accessLog.js";

/* Paths whose last segment is a credential (signed download links) */
const SECRET_PATHS = [/^(\/files\/signed\/)[^/]+/];

const pathOf = url => {
  const path = (url ?? "").split("?")[0];
  return SECRET_PATHS.reduce((p, pattern) => p.replace(pattern, "$1[redacted]"), path);
};
/* Referers can carry tokens in their query (e.g. /set-password?token=…): keep origin + path */
const withoutQuery = url => (typeof url === "string" ? url.split(/[?#]/)[0] : undefined);
const byteLength = (chunk, encoding) => {
  if (typeof chunk === "string") return Buffer.byteLength(chunk, typeof encoding === "string" ? encoding : "utf8");
  return chunk instanceof Uint8Array ? chunk.byteLength : 0;
};
const msSince = (start, end = process.hrtime.bigint()) => Math.round(Number(end - start) / 1e4) / 100;
const round = ms => Math.round(ms * 100) / 100;
const outcomeOf = (status, aborted) => {
  if (aborted) return "aborted";
  if (status >= 500) return "server_error";
  if (status >= 400) return "client_error";
  if (status >= 300) return "redirect";
  return "success";
};

/* One access-log line per request, written when the response closes (finished or the client
   went away). Measures total time, time to first byte, bytes in and out, and the database
   time the request spent (summed across parallel queries). Never logs bodies, query values,
   cookies or the Authorization header. */
export const accessLog = (req, res, next) => {
  if (!accessLogger || env.accessLog.ignore.includes(req.path)) return next();

  const startedAt = process.hrtime.bigint();
  const stats = newRequestStats();
  /* From the URL as sent: validation later replaces req.query with defaults */
  const queryKeys = [...new Set(new URLSearchParams(req.originalUrl.split("?")[1] ?? "").keys())];
  let headersAt = null;
  let responseBytes = 0;

  const { writeHead, write, end } = res;
  res.writeHead = function (...args) {
    headersAt ??= process.hrtime.bigint();
    return writeHead.apply(this, args);
  };
  res.write = function (chunk, encoding, ...rest) {
    responseBytes += byteLength(chunk, encoding);
    return write.call(this, chunk, encoding, ...rest);
  };
  res.end = function (chunk, encoding, ...rest) {
    responseBytes += byteLength(chunk, encoding);
    return end.call(this, chunk, encoding, ...rest);
  };

  res.on("close", () => {
    const durationMs = msSince(startedAt);
    const aborted = !res.writableFinished;
    const contentType = res.getHeader("content-type");
    accessLogger.info({
      requestId: req.id,
      method: req.method,
      route: req.routePattern ?? null,
      path: pathOf(req.originalUrl),
      ...(queryKeys.length && { queryKeys }),
      status: res.statusCode,
      outcome: outcomeOf(res.statusCode, aborted),
      durationMs,
      ttfbMs: headersAt ? msSince(startedAt, headersAt) : null,
      slow: durationMs > env.slowRequestMs,
      requestBytes: Number(req.headers["content-length"]) || 0,
      responseBytes,
      ...(contentType && { contentType: String(contentType).split(";")[0] }),
      db: {
        postgres: { queries: stats.postgres.queries, ms: round(stats.postgres.ms) },
        mongo: { queries: stats.mongo.queries, ms: round(stats.mongo.ms) }
      },
      tenantId: req.context?.tenantId ?? null,
      userId: req.context?.userId ?? null,
      role: req.context?.role ?? null,
      ip: req.ip,
      userAgent: req.get("user-agent") ?? null,
      ...(req.get("referer") && { referer: withoutQuery(req.get("referer")) }),
      ...(req.get("origin") && { origin: req.get("origin") }),
      httpVersion: req.httpVersion,
      ...(req.rateLimit && { rateLimit: { limit: req.rateLimit.limit, remaining: req.rateLimit.remaining } }),
      ...(res.locals.error && { errorCode: res.locals.error.code })
    });
  });

  trackRequest(stats, next);
};
