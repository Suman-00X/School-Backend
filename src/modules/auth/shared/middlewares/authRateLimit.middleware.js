import env from "../../../../common/config/env.config.js";
import { ipKeyGenerator, strictRateLimit } from "../../../../common/http/security.js";

const { rateLimitWindowMs: windowMs, rateLimitMax: limit } = env.auth;
const ip = req => ipKeyGenerator(req.ip ?? "");
const email = req =>
  String(req.body?.email ?? "")
    .trim()
    .toLowerCase();

/* Sign-in: per IP + email (one account), and per IP overall (one IP trying many accounts) */
export const loginRateLimit = [
  strictRateLimit({ windowMs, limit, key: req => `${ip(req)}:${email(req)}` }),
  strictRateLimit({ windowMs, limit: limit * 10, key: ip })
];

/* Refresh: per session (the id before the dot), so a school behind one NAT is not one bucket */
export const refreshRateLimit = strictRateLimit({
  windowMs,
  limit: limit * 6,
  key: req =>
    `session:${String(req.body?.refreshToken ?? "")
      .split(".")[0]
      .slice(0, 40)}`
});

/* Reset requests: per IP + email, and per IP overall */
export const resetRequestRateLimit = [
  strictRateLimit({ windowMs, limit: Math.max(3, Math.floor(limit / 2)), key: req => `${ip(req)}:${email(req)}` }),
  strictRateLimit({ windowMs, limit: limit * 5, key: ip })
];

/* Spending a link: per IP */
export const linkRateLimit = strictRateLimit({ windowMs, limit: limit * 5, key: ip });
