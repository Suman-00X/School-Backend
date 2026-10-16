import cors from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import env from "../config/env.config.js";
import { ERROR_CODES } from "./errors.js";

const tooMany = (req, res) =>
  res.status(429).json({
    success: false,
    message: "Too many requests. Please slow down and try again shortly.",
    error: { code: ERROR_CODES.TOO_MANY_REQUESTS, requestId: req.id }
  });

/* A stricter limit for sensitive public endpoints (sign-in, password reset).
   keyField: also key on a body field (e.g. email), so one school office sharing an IP
   does not lock everyone out, while guessing one account stays slow. */
export const strictRateLimit = ({ windowMs, limit, keyField }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: tooMany,
    keyGenerator: req =>
      `${ipKeyGenerator(req.ip ?? "")}:${keyField ? String(req.body?.[keyField] ?? "").toLowerCase() : ""}`
  });

/* Security headers, CORS and rate limiting for the whole app */
export const securityMiddlewares = () => [
  helmet(),

  cors({
    origin: env.allowedOrigins.length ? env.allowedOrigins : !env.isProduction,
    exposedHeaders: ["RateLimit", "RateLimit-Policy", "Retry-After"]
  }),

  rateLimit({
    windowMs: env.rateLimitWindowMs,
    limit: env.rateLimitMax,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: tooMany
  })
];
