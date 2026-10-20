import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import env from "../config/env.config.js";
import { logger } from "./logger.js";

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/* The request id, also returned in the X-Request-Id header (and in error responses) to
   correlate support tickets, and an application-log line for requests that need attention:
   failed (4xx/5xx) or slow. The line carries the route template, who made the request, how
   long it took and, when it failed, the error code and message the client saw.
   Every request, including the ones that went fine, is in the access log (accessLog.js);
   with the access log off, this logs every request instead. */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers["x-request-id"];
    const id = typeof incoming === "string" && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  customLogLevel: (req, res, error) => {
    if (error || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    /* Slow but successful */
    if (Date.now() - (res.locals.startedAt ?? Date.now()) > env.slowRequestMs) return "warn";
    return env.accessLog.mode === "off" ? "info" : "silent";
  },
  customSuccessMessage: (req, res, responseTime) =>
    `${req.method} ${req.routePattern ?? req.originalUrl?.split("?")[0]} ${res.statusCode} in ${Math.round(responseTime)} ms` +
    (responseTime > env.slowRequestMs ? " (slow)" : ""),
  customErrorMessage: (req, res) =>
    `${req.method} ${req.routePattern ?? req.originalUrl?.split("?")[0]} failed with ${res.statusCode}`,
  serializers: {
    req: req => ({ id: req.id, method: req.method, url: req.url, ip: req.remoteAddress }),
    res: res => ({ statusCode: res.statusCode })
  },
  customProps: (req, res) => ({
    ...(req.routePattern && { route: req.routePattern }),
    ...(req.context && { tenantId: req.context.tenantId, userId: req.context.userId, role: req.context.role }),
    ...(res.locals.error && { error: res.locals.error })
  })
});

/* Remember when the request started (for the slow-request level) */
export const requestStart = (req, res, next) => {
  res.locals.startedAt = Date.now();
  next();
};
