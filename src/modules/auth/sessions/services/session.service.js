import { signAccessToken } from "../../../../common/auth/authenticate.middleware.js";
import { revokeSession } from "../../../../common/auth/revocation.js";
import env from "../../../../common/config/env.config.js";
import { hashPassword, needsRehash, verifyPassword } from "../../../../common/crypto/password.js";
import { digest, randomToken } from "../../../../common/crypto/tokens.js";
import { transaction } from "../../../../common/database/postgres.js";
import { forbidden, notFound, unauthorized } from "../../../../common/http/errors.js";
import { runInTenant } from "../../../../common/tenancy/context.js";
import { findTenantByCode } from "../../../../common/tenancy/tenant.service.js";
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

/* The sign-in itself, inside the school's databases */
const signIn = async (tenant, { email, password }, client, attempt) => {
  const ctx = { tenantId: tenant.id, role: "SYSTEM" };
  const user = await accountService.credentials.find(ctx, email);

  /* Always one hash check, so timing does not reveal unknown accounts */
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
    throw unauthorized(BAD_CREDENTIALS);
  }
  if (user.status !== "ACTIVE") throw forbidden("This account is disabled. Please contact the school office.");
  await signInThrottle.clear(attempt);

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
  /* Sign in with the school code, email and password -> tokens */
  login: async ({ schoolCode, email, password }, client) => {
    const tenant = await findTenantByCode(schoolCode);
    /* Counted before the password check, also for unknown schools and emails */
    const attempt = {
      tenantKey: tenant?.id ?? `code:${String(schoolCode).trim().toUpperCase()}`,
      email,
      ip: client.ipAddress ?? "unknown"
    };
    await signInThrottle.claim(attempt);

    /* Unknown school: the same hash check and the same answer as a wrong password */
    if (!tenant) {
      await verifyPassword(password, null);
      throw unauthorized(BAD_CREDENTIALS);
    }
    return runInTenant(tenant.id, () => signIn(tenant, { email, password }, client, attempt));
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
