import env from "../../../../common/config/env.config.js";
import { createRouter } from "../../../../common/http/router.js";
import { ipKeyGenerator, strictRateLimit } from "../../../../common/http/security.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { authenticateSystemAdmin, sameSiteOnly } from "../../shared/middlewares/authenticateSystemAdmin.middleware.js";
import { systemAdminController as controller } from "../controllers/systemAdmin.controller.js";
import { systemAdminValidators as rules } from "../validators/systemAdmin.validator.js";

const { rateLimitWindowMs: windowMs, rateLimitMax: limit } = env.auth;
const ip = req => ipKeyGenerator(req.ip ?? "");

/* Sign-in: per IP + email, and per IP overall */
const loginRateLimit = [
  strictRateLimit({
    windowMs,
    limit,
    key: req => `system-admin:${ip(req)}:${String(req.body?.email ?? "").toLowerCase()}`
  }),
  strictRateLimit({ windowMs, limit: limit * 5, key: req => `system-admin:${ip(req)}` })
];

/* Public, no session: /api/v1/platform/auth/login (sets the session cookie) */
export const publicSystemAdminRoutes = createRouter();
publicSystemAdminRoutes.post("/login", sameSiteOnly, ...loginRateLimit, validate(rules.login), controller.login);

/* Signed in: /api/v1/platform/auth/me, /api/v1/platform/auth/logout */
export const systemAdminRoutes = createRouter();
systemAdminRoutes.get("/me", authenticateSystemAdmin, controller.me);
systemAdminRoutes.post("/logout", authenticateSystemAdmin, controller.logout);
