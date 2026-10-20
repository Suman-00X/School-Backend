import jwt from "jsonwebtoken";
import env from "../../../../common/config/env.config.js";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_PATH,
  SESSION_HOURS,
  SESSION_TOKEN_TYPE
} from "../constants/platform.constants.js";

/* The cookie holds a signed token with typ "platform": school endpoints only take typ
   "access", so it opens nothing in a school, and a school token opens nothing here */
const sign = admin =>
  jwt.sign({ systemAdminId: admin.id, typ: SESSION_TOKEN_TYPE, iatMs: Date.now() }, env.jwtSecret, {
    algorithm: "HS256",
    expiresIn: SESSION_HOURS * 3600
  });

const cookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: "strict",
  path: SESSION_COOKIE_PATH
};

/* Start a session: the cookie, and when it expires */
export const startSession = (res, admin) => {
  const maxAge = SESSION_HOURS * 3_600_000;
  res.cookie(SESSION_COOKIE, sign(admin), { ...cookieOptions, maxAge });
  return new Date(Date.now() + maxAge);
};

export const endSession = res => res.clearCookie(SESSION_COOKIE, cookieOptions);

/* The session token from the Cookie header, or null (no cookie-parser dependency) */
export const sessionToken = req => {
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === SESSION_COOKIE) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
};

/* -> payload, { expired: true }, or null when the token is not a system admin session */
export const verifySession = token => {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
    return payload.typ === SESSION_TOKEN_TYPE && payload.systemAdminId ? payload : null;
  } catch (error) {
    return error.name === "TokenExpiredError" ? { expired: true } : null;
  }
};
