import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import env from "../config/env.config.js";
import { ERROR_CODES } from "./errors.js";

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
    handler: (req, res) =>
      res.status(429).json({
        success: false,
        message: "Too many requests. Please slow down and try again shortly.",
        error: { code: ERROR_CODES.TOO_MANY_REQUESTS }
      })
  })
];
