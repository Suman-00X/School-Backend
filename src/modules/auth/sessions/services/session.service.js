import { signAccessToken } from "../../../../common/auth/authenticate.middleware.js";
import { revokeSession } from "../../../../common/auth/revocation.js";
import env from "../../../../common/config/env.config.js";
import { hashPassword, needsRehash, verifyPassword } from "../../../../common/crypto/password.js";
import { digest, randomToken } from "../../../../common/crypto/tokens.js";
import { transaction } from "../../../../common/database/postgres.js";
import { forbidden, notFound, tooManyRequests, unauthorized } from "../../../../common/http/errors.js";
import { findTenantByCode } from "../../../../common/tenancy/tenant.service.js";
import { accountService } from "../../../users/accounts/index.js";
import { BAD_CREDENTIALS } from "../../shared/constants/auth.constants.js";
import { auditAuth } from "../../shared/utils/authAudit.util.js";
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
  refreshToken: `${session.id}.${secret}`,
  refreshTokenExpiresAt: session.expiresAt
});

const minutesUntil = date => Math.max(1, Math.ceil((new Date(date) - Date.now()) / 60_000));

export const sessionService = {
  /* Sign in with the school code, email and password -> tokens */
  login: async ({ schoolCode, email, password }, client) => {
    const tenant = await findTenantByCode(schoolCode);
    const ctx = { tenantId: tenant?.id, role: "SYSTEM" };
    const user = tenant ? await accountService.credentials.find(ctx, email) : null;

    if (user?.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      throw tooManyRequests(
        `Too many failed sign-in attempts. Try again in ${minutesUntil(user.lockedUntil)} minute(s), or reset your password.`
      );
    }

    /* Always one hash check, so timing does not reveal unknown accounts */
    const valid = await verifyPassword(password, user?.passwordHash);
    if (!user || !valid) {
      if (user) {
        await accountService.credentials.recordFailedLogin(ctx, user.id, {
          maxFailures: env.auth.maxFailedLogins,
          lockoutMinutes: env.auth.lockoutMinutes
        });
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
  },

  /* Exchange a refresh token for new tokens. The refresh token rotates: the old one
     stops working, and presenting it again (a sign of theft) ends the session. */
  refresh: async (refreshToken, client) => {
    const [sessionId, secret] = String(refreshToken).split(".");
    if (!UUID.test(sessionId ?? "") || !secret) throw unauthorized(SESSION_ENDED);

    const outcome = await transaction(async tx => {
      const session = await authSessionRepository.lockById(sessionId, { dbc: tx });
      if (!session || session.revokedAt || new Date(session.expiresAt) <= new Date()) return { error: SESSION_ENDED };

      const presented = digest(secret);
      if (presented === session.previousRefreshHash) {
        await authSessionRepository.update(
          session.tenantId,
          session.id,
          { revokedAt: new Date(), revokedReason: "REUSED" },
          { dbc: tx }
        );
        return { error: "This sign-in was ended for your security. Please sign in again.", revoke: session.id };
      }
      if (presented !== session.refreshHash) return { error: SESSION_ENDED };

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
