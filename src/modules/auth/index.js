import { createRouter } from "../../common/http/router.js";
import { credentialRoutes, publicCredentialRoutes } from "./credentials/index.js";
import { publicSessionRoutes, sessionRoutes } from "./sessions/index.js";

/* Auth module, mounted at /api/v1/auth in two parts:
   - publicAuthRoutes: before authentication (sign-in, refresh, password links), rate-limited
   - authRoutes: after authentication (sign-out, devices, change password, invitations) */
export const publicAuthRoutes = createRouter();
publicAuthRoutes.__public = true;
publicAuthRoutes.use(publicSessionRoutes);
publicAuthRoutes.use(publicCredentialRoutes);

export const authRoutes = createRouter();
authRoutes.use(sessionRoutes);
authRoutes.use(credentialRoutes);
