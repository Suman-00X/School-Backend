import { createRouter } from "../../../../common/http/router.js";
import { documented } from "../../../../common/openapi/openapi.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { linkRateLimit, resetRequestRateLimit } from "../../shared/middlewares/authRateLimit.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { credentialController as controller } from "../controllers/credential.controller.js";
import { CREDENTIAL_PERMISSIONS as can } from "../permissions/credential.permissions.js";
import { credentialValidators as rules } from "../validators/credential.validator.js";

/* Public, no token: request a reset link; spend an invitation or reset link */
export const publicCredentialRoutes = createRouter();
publicCredentialRoutes.post(
  "/password-reset-requests",
  documented({
    summary: "Request a password reset link",
    description:
      "Always 202, whether or not an account matches. Without schoolCode, every school with an active account " +
      "for the email sends its own link.",
    responses: { 202: { description: "Accepted (the same answer either way)" } }
  }),
  ...resetRequestRateLimit,
  validate(rules.requestReset),
  controller.requestReset
);
publicCredentialRoutes.post("/password-resets", linkRateLimit, validate(rules.reset), controller.reset);

/* Signed in */
export const credentialRoutes = createRouter();
credentialRoutes.patch("/password", authorize(can.changeOwn), validate(rules.change), controller.change);
credentialRoutes.post("/invitations", authorize(can.invite), validate(rules.invite), controller.invite);
