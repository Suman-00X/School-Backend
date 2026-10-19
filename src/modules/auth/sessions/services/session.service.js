import { signAccessToken } from "../../../../common/auth/authenticate.middleware.js";
import { revokeSession } from "../../../../common/auth/revocation.js";
import env from "../../../../common/config/env.config.js";
import { hashPassword, needsRehash, verifyPassword } from "../../../../common/crypto/password.js";
import { digest, randomToken } from "../../../../common/crypto/tokens.js";
import { transaction } from "../../../../common/database/postgres.js";
import { forbidden, notFound, unauthorized } from "../../../../common/http/errors.js";
import { logger } from "../../../../common/logging/logger.js";
import { runInTenant } from "../../../../common/tenancy/context.js";
import { findTenantByCode, findTenantById } from "../../../../common/tenancy/tenant.service.js";
import { settingsService } from "../../../administration/settings/index.js";
import { accountService } from "../../../users/accounts/index.js";
import { BAD_CREDENTIALS } from "../../shared/constants/auth.constants.js";
import { auditAuth } from "../../shared/utils/authAudit.util.js";
import { signInThrottle } from "../../shared/utils/signInThrottle.util.js";
import { authSessionRepository } from "../repositories/authSession.repository.js";

const SESSION_ENDED = "Your session has ended. Please sign in again.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const summary = user => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  role: user.role
});

/* Access token + rotated refresh token for a session */
const tokens = (user, session, secret) => ({
  tokenType: "Bearer",
  accessToken: signAccessToken({ userId: user.id, tenantId: user.tenantId, role: user.role, sessionId: session.id }),
  expiresIn: env.auth.accessTokenTtlSeconds,
  refreshToken: `${user.tenantId}.${session.id}.${secret}`,
  refreshTokenExpiresAt: session.expiresAt
});

/* Two tabs refreshing at once: the loser presents the token the winner just rotated.
   Within this window that is refused without ending the session. */
const ROTATION_GRACE_MS = 30_000;

const DISABLED = "This account is disabled. Please contact the school office.";

/* One school's answer to an email and password, inside the school's databases.
   The attempt is claimed first (lockout), and there is always one hash check, so timing
   does not reveal unknown accounts -> { outcome: MATCH | WRONG | DISABLED | LOCKED, user? } */
const checkPassword = async (tenant, { email, password }, client) => {
  const attempt = { tenantKey: tenant.id, email, ip: client.ipAddress ?? "unknown" };
  try {
    await signInThrottle.claim(attempt);
  } catch (error) {
    if (error.status === 429) return { outcome: "LOCKED", error };
    throw error;
  }
  return runInTenant(tenant.id, async () => {
    const ctx = { tenantId: tenant.id, role: "SYSTEM" };
    const user = await accountService.credentials.find(ctx, email);
    const valid = await verifyPassword(password, user?.passwordHash);
    if (!user || !valid) {
      if (user) {
        auditAuth({
          tenantId: tenant.id,
          userId: user.id,
          role: user.role,
          event: "login.failed",
          statusCode: 401,
          ...client
        });
      }
      return { outcome: "WRONG" };
    }
    if (user.status !== "ACTIVE") return { outcome: "DISABLED" };
    await signInThrottle.clear(attempt);
    return { outcome: "MATCH", tenant, user };
  });
};

/* A new session for a checked account, inside its school's databases */
const startSession = (tenant, user, password, client) =>
  runInTenant(tenant.id, async () => {
    const ctx = { tenantId: tenant.id, role: "SYSTEM" };
    const rehash = needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(password) } : {};
    await accountService.credentials.recordLogin(ctx, user.id, rehash);

    const secret = randomToken();
    const session = await authSessionRepository.create(tenant.id, {
      userId: user.id,
      refreshHash: digest(secret),
      expiresAt: new Date(Date.now() + env.auth.refreshTokenTtlDays * 86_400_000),
      userAgent: client.userAgent,
      ipAddress: client.ipAddress
    });
    auditAuth({ tenantId: tenant.id, userId: user.id, role: user.role, event: "login", statusCode: 201, ...client });

    return {
      ...tokens(user, session, secret),
      user: summary(user),
      school: { id: tenant.id, name: tenant.name, code: tenant.code }
    };
  });

/* Signed in to a named school (code or id): the same answer as before schools were found
   by email. Unknown school: the same claim, hash check and answer as a wrong password. */
const signInToSchool = async (tenant, unknownKey, credentials, client) => {
  if (!tenant) {
    await signInThrottle.claim({ tenantKey: unknownKey, email: credentials.email, ip: client.ipAddress ?? "unknown" });
    await verifyPassword(credentials.password, null);
    throw unauthorized(BAD_CREDENTIALS);
  }
  const result = await checkPassword(tenant, credentials, client);
  if (result.outcome === "LOCKED") throw result.error;
  if (result.outcome === "WRONG") throw unauthorized(BAD_CREDENTIALS);
  if (result.outcome === "DISABLED") throw forbidden(DISABLED);
  const session = await startSession(tenant, result.user, credentials.password, client);
  /* Self-healing: an account the login directory missed is listed from now on */
  await accountService.credentials.signedIn({ tenantId: tenant.id, role: "SYSTEM" }, result.user);
  return session;
};

/* One school's check when the email may be in several: a school that cannot answer
   (suspended since the look-up, database down) never blocks the others */
const checkSafely = (tenant, credentials, client) =>
  checkPassword(tenant, credentials, client).catch(error => {
    if (error.status === 403 || error.status === 404) return { outcome: "WRONG" };
    logger.error({ err: error, tenantId: tenant.id }, "Sign-in check failed in one school");
    return { outcome: "ERROR", error };
  });

/* What the person picks from when the password is right in several schools */
const schoolChoice = ({ tenant, user }) =>
  runInTenant(tenant.id, async () => ({
    id: tenant.id,
    name: tenant.name,
    code: tenant.code,
    role: user.role,
    logoUrl: await settingsService.logoUrl({ tenantId: tenant.id, role: "SYSTEM" }).catch(() => null)
  }));

/* Signed in by email alone: the password is checked in every school that has the email
   (at most 20, side by side), and only schools where it is right are ever named.
   - right in one school: signed in there
   - right in several: { chooseSchool, schools }; the client signs in again with schoolId
   - right nowhere: 403 when it was right for disabled accounts only; 429 when a school
     could not be checked because of a lockout (500 when it could not answer); else 401.
   Disabled or locked accounts in one school never block the others. */
const signInByEmail = async (credentials, client) => {
  const schools = await accountService.credentials.schoolsFor(credentials.email);
  if (!schools.length) return signInToSchool(null, "directory", credentials, client);

  const results = await Promise.all(schools.map(tenant => checkSafely(tenant, credentials, client)));
  const matches = results.filter(r => r.outcome === "MATCH");
  if (matches.length === 1) return startSession(matches[0].tenant, matches[0].user, credentials.password, client);
  if (matches.length > 1) return { chooseSchool: true, schools: await Promise.all(matches.map(schoolChoice)) };

  if (results.some(r => r.outcome === "DISABLED")) throw forbidden(DISABLED);
  const unchecked = results.find(r => r.outcome === "LOCKED") ?? results.find(r => r.outcome === "ERROR");
  if (unchecked) throw unchecked.error;
  throw unauthorized(BAD_CREDENTIALS);
};

/* Rotate a refresh token, inside the school's databases */
const rotate = async (sessionId, secret, client) => {
  const outcome = await transaction(async tx => {
    const session = await authSessionRepository.lockById(sessionId, { dbc: tx });
    if (!session || session.revokedAt || new Date(session.expiresAt) <= new Date()) return { error: SESSION_ENDED };

    const presented = digest(secret);
    if (presented !== session.refreshHash) {
      const justRotated =
        presented === session.previousRefreshHash && Date.now() - new Date(session.lastUsedAt) < ROTATION_GRACE_MS;
      if (justRotated) return { error: "This refresh token was just replaced. Use the newest one." };
      /* Any other token for this session is an old one: a sign of theft. End the session. */
      await authSessionRepository.update(
        session.tenantId,
        session.id,
        { revokedAt: new Date(), revokedReason: "REUSED" },
        { dbc: tx }
      );
      return { error: "This sign-in was ended for your security. Please sign in again.", revoke: session.id };
    }

    const ctx = { tenantId: session.tenantId, role: "SYSTEM" };
    const [user] = await accountService.findManyByIds(ctx, [session.userId]);
    if (!user || user.status !== "ACTIVE") {
      await authSessionRepository.update(
        session.tenantId,
        session.id,
        { revokedAt: new Date(), revokedReason: "ACCOUNT_DISABLED" },
        { dbc: tx }
      );
      return { error: SESSION_ENDED, revoke: session.id };
    }

    const next = randomToken();
    const updated = await authSessionRepository.update(
      session.tenantId,
      session.id,
      {
        refreshHash: digest(next),
        previousRefreshHash: presented,
        lastUsedAt: new Date(),
        userAgent: client.userAgent ?? session.userAgent,
        ipAddress: client.ipAddress ?? session.ipAddress
      },
      { dbc: tx }
    );
    return { result: { ...tokens(user, updated, next), user: summary(user) } };
  });

  /* Revocations and errors happen after commit, so the session row change sticks */
  if (outcome.revoke) await revokeSession(outcome.revoke);
  if (outcome.error) throw unauthorized(outcome.error);
  return outcome.result;
};

export const sessionService = {
  /* Sign in with email and password -> tokens, or the schools to choose from when the
     password is right in more than one. schoolId (after choosing) or schoolCode (older
     clients) names the school and skips the search. */
  login: async ({ email, password, schoolId, schoolCode }, client) => {
    const credentials = { email, password };
    if (schoolId) return signInToSchool(await findTenantById(schoolId), `id:${schoolId}`, credentials, client);
    if (schoolCode) {
      const unknownKey = `code:${String(schoolCode).trim().toUpperCase()}`;
      return signInToSchool(await findTenantByCode(schoolCode), unknownKey, credentials, client);
    }
    return signInByEmail(credentials, client);
  },

  /* Exchange a refresh token for new tokens. The refresh token rotates: the old one
     stops working, and presenting it again (a sign of theft) ends the session.
     The token names its school: "<schoolId>.<sessionId>.<secret>". */
  refresh: async (refreshToken, client) => {
    const [tenantId, sessionId, secret] = String(refreshToken).split(".");
    if (!UUID.test(tenantId ?? "") || !UUID.test(sessionId ?? "") || !secret) throw unauthorized(SESSION_ENDED);
    try {
      return await runInTenant(tenantId, () => rotate(sessionId, secret, client));
    } catch (error) {
      if (error.status === 404 || error.status === 403) throw unauthorized(SESSION_ENDED);
      throw error;
    }
  },

  /* Sign out this device */
  logout: async ctx => {
    if (!ctx.sessionId) return false;
    await authSessionRepository.update(ctx.tenantId, ctx.sessionId, { revokedAt: new Date(), revokedReason: "LOGOUT" });
    await revokeSession(ctx.sessionId);
    return true;
  },

  /* The signed-in user's devices, current one marked */
  list: async ctx =>
    (await authSessionRepository.listLive(ctx.tenantId, ctx.userId)).map(session => ({
      id: session.id,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      current: session.id === ctx.sessionId
    })),

  /* Sign out one of my devices */
  revoke: async (ctx, sessionId) => {
    const session = (await authSessionRepository.listLive(ctx.tenantId, ctx.userId)).find(s => s.id === sessionId);
    if (!session) throw notFound("Session");
    await authSessionRepository.update(ctx.tenantId, sessionId, {
      revokedAt: new Date(),
      revokedReason: "SIGNED_OUT_REMOTELY"
    });
    await revokeSession(sessionId);
  },

  /* For credentials: end a user's sessions (all, or all but the current one) */
  revokeAllForUser: async (ctx, userId, { exceptId, reason, dbc }) => {
    const ids = await authSessionRepository.revokeAll(ctx.tenantId, userId, { exceptId, reason, dbc });
    await Promise.all(ids.map(revokeSession));
    return ids.length;
  }
};
