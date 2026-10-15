import jwt from "jsonwebtoken";
import env from "../config/env.config.js";
import { unauthorized } from "../http/errors.js";
import { ALL_ROLES } from "./roles.js";

/* Verifies the Bearer token and sets req.context = { tenantId, userId, role }.
   Every service receives this context; tenant isolation starts here. */
export const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw unauthorized("Missing or malformed Authorization header. Expected: Bearer <token>");
  }

  let payload;
  try {
    payload = jwt.verify(header.slice(7), env.jwtSecret);
  } catch (error) {
    throw unauthorized(error.name === "TokenExpiredError" ? "Your session has expired. Please sign in again." : "Invalid token");
  }

  if (!payload.userId || !payload.tenantId || !ALL_ROLES.includes(payload.role)) {
    throw unauthorized("Invalid token");
  }

  req.context = {
    tenantId: payload.tenantId,
    userId: payload.userId,
    role: payload.role
  };

  next();
};
