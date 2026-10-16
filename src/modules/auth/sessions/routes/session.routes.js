import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { loginRateLimit, refreshRateLimit } from "../../shared/middlewares/authRateLimit.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { sessionController as controller } from "../controllers/session.controller.js";
import { SESSION_PERMISSIONS as can } from "../permissions/session.permissions.js";
import { sessionValidators as rules } from "../validators/session.validator.js";

/* Public, no token: /api/v1/auth/login, /api/v1/auth/refresh */
export const publicSessionRoutes = createRouter();
publicSessionRoutes.post("/login", ...loginRateLimit, validate(rules.login), controller.login);
publicSessionRoutes.post("/refresh", refreshRateLimit, validate(rules.refresh), controller.refresh);

/* Signed in: /api/v1/auth/logout, /api/v1/auth/sessions */
export const sessionRoutes = createRouter();
sessionRoutes.post("/logout", authorize(can.manageOwn), controller.logout);
sessionRoutes.get("/sessions", authorize(can.manageOwn), controller.list);
sessionRoutes.delete("/sessions/:sessionId", authorize(can.manageOwn), validate(rules.revoke), controller.revoke);
