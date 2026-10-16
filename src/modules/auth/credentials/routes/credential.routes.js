import { createRouter } from "../../../../common/http/router.js";
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
  ...resetRequestRateLimit,
  validate(rules.requestReset),
  controller.requestReset
);
publicCredentialRoutes.post("/password-resets", linkRateLimit, validate(rules.reset), controller.reset);

/* Signed in */
export const credentialRoutes = createRouter();
credentialRoutes.patch("/password", authorize(can.changeOwn), validate(rules.change), controller.change);
credentialRoutes.post("/invitations", authorize(can.invite), validate(rules.invite), controller.invite);
