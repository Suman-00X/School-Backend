import express from "express";
import { sql } from "drizzle-orm";
import mongoose from "mongoose";
import { createHash, timingSafeEqual } from "node:crypto";
import env from "./common/config/env.config.js";
import { platformDb } from "./common/tenancy/context.js";
import { httpMetrics } from "./common/observability/httpMetrics.middleware.js";
import { renderMetrics } from "./common/observability/metrics.js";
import { requestLogger, requestStart } from "./common/logging/requestLogger.middleware.js";
import { accessLog } from "./common/logging/accessLog.middleware.js";
import { securityMiddlewares } from "./common/http/security.js";
import { errorHandler, notFoundHandler } from "./common/http/errorHandler.middleware.js";
import { buildOpenApi, docsPage, DOCS_CSP } from "./common/openapi/openapi.js";
import downloadRoutes from "./common/storage/download.routes.js";
import v1 from "./routes.js";

const app = express();

app.disable("x-powered-by");

/* Last line of defence: secret columns never leave the API, even if a query
   (e.g. a relation `with: { user: true }`) selects them by mistake */
const SECRET_FIELDS = new Set(["passwordHash", "refreshHash", "previousRefreshHash", "tokenHash"]);
app.set("json replacer", (key, value) => (SECRET_FIELDS.has(key) ? undefined : value));
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 0));

app.use(requestStart);
/* Access log (API monitoring) first, so its timing covers everything after it */
app.use(accessLog);
app.use(requestLogger);
app.use(httpMetrics);

/* Prometheus scrape endpoint: before rate limiting, off unless METRICS_TOKEN is set */
/* Compare digests: equal length always, so any input (including non-ASCII) is safe */
const sameSecret = (given, expected) =>
  timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(expected).digest());
app.get("/metrics", (req, res, next) => {
  const token = req.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!env.metricsToken || !sameSecret(token, env.metricsToken)) return next();
  res.type("text/plain; version=0.0.4").send(renderMetrics());
});

app.use(securityMiddlewares());

/* Raw bodies are kept for routes that verify signatures (payment webhooks) */
app.use(
  express.json({
    limit: "1mb",
    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    }
  })
);

/* Liveness: the process is up */
app.get("/health", (req, res) => {
  res.json({ success: true, message: "Service is healthy", data: { timestamp: new Date().toISOString() } });
});

/* Readiness: the platform database and the MongoDB server answer (for load balancers / Kubernetes) */
app.get("/ready", async (req, res) => {
  const checks = { postgres: false, mongo: mongoose.connection.readyState === 1 };
  try {
    await platformDb().execute(sql`select 1`);
    checks.postgres = true;
  } catch {
    /* reported below */
  }
  const ready = checks.postgres && checks.mongo;
  res.status(ready ? 200 : 503).json({
    success: ready,
    message: ready ? "Service is ready" : "Service is not ready",
    data: checks
  });
});

/* API documentation, generated from the route table */
let openApiDocument = null;
app.get("/api/v1/openapi.json", (req, res) => {
  openApiDocument ??= buildOpenApi(v1, {
    basePath: "/api/v1",
    title: "School Management API",
    version: "1.0.0",
    description: "Multi-tenant school management platform. See docs/API.md for conventions.",
    publicPaths: ["/api/v1/public"]
  });
  res.json(openApiDocument);
});
app.get("/api/docs", (req, res) => {
  res.setHeader("Content-Security-Policy", DOCS_CSP);
  res.type("html").send(docsPage("/api/v1/openapi.json"));
});

/* Short-lived signed downloads for local file storage */
app.use("/files", downloadRoutes);

app.use("/api/v1", v1);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
