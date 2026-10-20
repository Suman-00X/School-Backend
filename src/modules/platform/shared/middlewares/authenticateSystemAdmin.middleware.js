import { forbidden, unauthorized } from "../../../../common/http/errors.js";
import { SESSION_ENDED } from "../constants/platform.constants.js";
import { systemAdminRepository } from "../../system-admins/repositories/systemAdmin.repository.js";
import { sessionToken, verifySession } from "../utils/systemAdminSession.util.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const requireXhr = req => {
  if (!SAFE_METHODS.has(req.method) && req.get("x-requested-with") !== "XMLHttpRequest") {
    throw forbidden("Missing X-Requested-With header");
  }
};

/* Sign-in: the same rule, so another site cannot sign a browser in to an account of its own */
export const sameSiteOnly = (req, res, next) => {
  requireXhr(req);
  next();
};

/* Every admin-console endpoint after sign-in: the session cookie of an active system admin.
   A change (POST, PUT, PATCH, DELETE) must also carry X-Requested-With, which a page on
   another site cannot send without CORS allowing it: the cookie alone never changes anything.
   Sets req.systemAdmin = { id, name, email }. */
export const authenticateSystemAdmin = async (req, res, next) => {
  requireXhr(req);
  const token = sessionToken(req);
  if (!token) throw unauthorized("Sign in to the admin console");
  const payload = verifySession(token);
  if (payload?.expired) throw unauthorized("Your session has expired. Please sign in again.");
  if (!payload) throw unauthorized(SESSION_ENDED);

  const admin = await systemAdminRepository.findById(payload.systemAdminId);
  const revoked =
    admin?.sessionsValidAfter && Number(payload.iatMs ?? 0) < new Date(admin.sessionsValidAfter).getTime();
  if (!admin || admin.status !== "ACTIVE" || revoked) throw unauthorized(SESSION_ENDED);
  req.systemAdmin = { id: admin.id, name: admin.name, email: admin.email };
  next();
};
