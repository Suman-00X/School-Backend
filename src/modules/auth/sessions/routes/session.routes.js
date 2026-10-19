import { createRouter } from "../../../../common/http/router.js";
import { documented } from "../../../../common/openapi/openapi.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { loginRateLimit, refreshRateLimit } from "../../shared/middlewares/authRateLimit.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { sessionController as controller } from "../controllers/session.controller.js";
import { SESSION_PERMISSIONS as can } from "../permissions/session.permissions.js";
import { sessionValidators as rules } from "../validators/session.validator.js";

/* Public, no token: /api/v1/auth/login, /api/v1/auth/refresh */
export const publicSessionRoutes = createRouter();
publicSessionRoutes.post(
  "/login",
  documented({
    summary: "Sign in with email and password",
    description:
      "The school is found from the email. Password right in one school: 201 with tokens. Right in several: 200 " +
      "{ chooseSchool: true, schools: [{ id, name, code, role, logoUrl }] } and no session; sign in again with " +
      "schoolId. schoolCode (older clients) or schoolId skips the search. 401 for every kind of wrong credential, " +
      "403 when the password was right only for disabled accounts, 429 when locked.",
    responses: {
      200: { description: "Choose a school to continue (no session yet)" },
      201: { description: "Signed in: accessToken, refreshToken, user, school" },
      429: { description: "Too many sign-in attempts" }
    }
  }),
  ...loginRateLimit,
  validate(rules.login),
  controller.login
);
publicSessionRoutes.post("/refresh", refreshRateLimit, validate(rules.refresh), controller.refresh);

/* Signed in: /api/v1/auth/logout, /api/v1/auth/sessions */
export const sessionRoutes = createRouter();
sessionRoutes.post("/logout", authorize(can.manageOwn), controller.logout);
sessionRoutes.get("/sessions", authorize(can.manageOwn), controller.list);
sessionRoutes.delete("/sessions/:sessionId", authorize(can.manageOwn), validate(rules.revoke), controller.revoke);
