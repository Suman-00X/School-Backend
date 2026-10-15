import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { logger } from "./logger.js";

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/* One log line per request, with a request id that is also returned in the
   X-Request-Id header (and in error responses) to correlate support tickets */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers["x-request-id"];
    const id = typeof incoming === "string" && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  customLogLevel: (req, res, error) =>
    error || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
  serializers: {
    req: req => ({ id: req.id, method: req.method, url: req.url }),
    res: res => ({ statusCode: res.statusCode })
  },
  customProps: req => (req.context ? { tenantId: req.context.tenantId, userId: req.context.userId } : {})
});
