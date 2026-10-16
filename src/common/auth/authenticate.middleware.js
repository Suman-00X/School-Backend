import jwt from "jsonwebtoken";
import env from "../config/env.config.js";
import { unauthorized } from "../http/errors.js";
import { isRevoked } from "./revocation.js";
import { ALL_ROLES } from "./roles.js";

/* Verifies the Bearer access token and sets req.context = { tenantId, userId, role, sessionId }.
   Every service receives this context; tenant isolation starts here. */
export const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw unauthorized("Missing or malformed Authorization header. Expected: Bearer <token>");
  }

  let payload;
  try {
    payload = jwt.verify(header.slice(7), env.jwtSecret, { algorithms: ["HS256"] });
  } catch (error) {
    throw unauthorized(
      error.name === "TokenExpiredError" ? "Your session has expired. Please sign in again." : "Invalid token"
    );
  }

  /* Only access tokens open the API (not, say, a token minted for another purpose) */
  if (
    !payload.userId ||
    !payload.tenantId ||
    !ALL_ROLES.includes(payload.role) ||
    (payload.typ && payload.typ !== "access")
  ) {
    throw unauthorized("Invalid token");
  }
  if (await isRevoked(payload)) throw unauthorized("Your session has ended. Please sign in again.");

  req.context = {
    tenantId: payload.tenantId,
    userId: payload.userId,
    role: payload.role,
    sessionId: payload.sid ?? null
  };

  next();
};

/* Issue an access token for a signed-in session */
export const signAccessToken = ({ userId, tenantId, role, sessionId }) =>
  jwt.sign({ userId, tenantId, role, sid: sessionId, typ: "access", iatMs: Date.now() }, env.jwtSecret, {
    algorithm: "HS256",
    expiresIn: env.auth.accessTokenTtlSeconds
  });
