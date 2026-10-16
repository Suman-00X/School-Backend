import env from "../config/env.config.js";
import { cache } from "../cache/cache.js";

/* Access tokens are short-lived JWTs that are not looked up in the database.
   To end them before they expire (logout, password reset, deactivation), a revocation
   marker is kept in the cache for as long as such a token could still be valid.
   With several API instances this needs Redis (REDIS_URL), like the rest of the cache. */

const sessionKey = sessionId => `auth:session:${sessionId}:revoked`;
const userKey = userId => `auth:user:${userId}:validAfter`;
const ttl = () => env.auth.accessTokenTtlSeconds + 60;

/* One session (logout) */
export const revokeSession = sessionId => cache.set(sessionKey(sessionId), true, ttl());

/* Every token of a user issued before now (password reset, deactivation) */
export const revokeUserTokens = userId => cache.set(userKey(userId), Date.now(), ttl());

/* When a token was issued, in ms (iatMs is ours; iat is whole seconds) */
const issuedAt = payload => payload.iatMs ?? payload.iat * 1000;

/* payload: a verified access token { userId, sid?, iat, iatMs? } */
export const isRevoked = async payload => {
  if (payload.sid && (await cache.get(sessionKey(payload.sid)))) return true;
  const validAfter = await cache.get(userKey(payload.userId));
  return validAfter !== undefined && issuedAt(payload) < validAfter;
};
