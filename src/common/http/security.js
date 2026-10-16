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
   key(req): what to count by (default: the client IP). Every call makes its own counter.
   Counters are per process; the account-level protection that must hold across
   instances lives in the shared cache (see auth signInThrottle). */
export const strictRateLimit = ({ windowMs, limit, key }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: tooMany,
    keyGenerator: req => (key ? key(req) : ipKeyGenerator(req.ip ?? ""))
  });

export { ipKeyGenerator };

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
    /* Gateway webhooks arrive from a few gateway IPs for every school, and are signed */
    skip: req => req.path.startsWith("/api/v1/public/payments/"),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: tooMany
  })
];
