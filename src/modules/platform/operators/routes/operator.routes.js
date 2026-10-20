import env from "../../../../common/config/env.config.js";
import { createRouter } from "../../../../common/http/router.js";
import { ipKeyGenerator, strictRateLimit } from "../../../../common/http/security.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { authenticateOperator } from "../../shared/middlewares/authenticateOperator.middleware.js";
import { operatorController as controller } from "../controllers/operator.controller.js";
import { operatorValidators as rules } from "../validators/operator.validator.js";

const { rateLimitWindowMs: windowMs, rateLimitMax: limit } = env.auth;

/* Sign-in: per IP + email, and per IP overall */
const loginRateLimit = [
  strictRateLimit({
    windowMs,
    limit,
    key: req => `operator:${ipKeyGenerator(req.ip ?? "")}:${String(req.body?.email ?? "").toLowerCase()}`
  }),
  strictRateLimit({ windowMs, limit: limit * 5, key: req => `operator:${ipKeyGenerator(req.ip ?? "")}` })
];

/* Public, no token: /api/v1/platform/auth/login */
export const publicOperatorRoutes = createRouter();
publicOperatorRoutes.post("/login", ...loginRateLimit, validate(rules.login), controller.login);

/* Signed in as an operator: /api/v1/platform/auth/me */
export const operatorRoutes = createRouter();
operatorRoutes.get("/me", authenticateOperator, controller.me);
