import { revokeUserTokens } from "../../../../common/auth/revocation.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";
import { hashPassword, verifyPassword } from "../../../../common/crypto/password.js";
import { digest, randomToken } from "../../../../common/crypto/tokens.js";
import { transaction } from "../../../../common/database/postgres.js";
import { forbidden, unprocessable } from "../../../../common/http/errors.js";
import { logger } from "../../../../common/logging/logger.js";
import { email } from "../../../../common/messaging/email.js";
import { runInTenant } from "../../../../common/tenancy/context.js";
import { findTenantByCode, getTenant } from "../../../../common/tenancy/tenant.service.js";
import { accountService } from "../../../users/accounts/index.js";
import { sessionService } from "../../sessions/index.js";
import { TOKEN_TTL_HOURS } from "../../shared/constants/auth.constants.js";
import { authEmails } from "../../shared/utils/authEmails.util.js";
import { signInThrottle } from "../../shared/utils/signInThrottle.util.js";
import { authTokenRepository } from "../repositories/authToken.repository.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LINK_INVALID = "This link is invalid or has expired. Ask for a new one.";

/* New single-use link; earlier unused links of the user stop working */
const issueToken = (ctx, userId, purpose, createdBy) =>
  transaction(async tx => {
    await authTokenRepository.spendUnused(ctx.tenantId, userId, { dbc: tx });
    /* The link names its school: "<schoolId>.<secret>" (only the digest is stored) */
    const token = `${ctx.tenantId}.${randomToken()}`;
    await authTokenRepository.create(
      ctx.tenantId,
      {
        userId,
        purpose,
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS[purpose] * 3_600_000),
        createdBy
      },
      { dbc: tx }
    );
    return token;
  });

/* Email a reset link to the account with this address in the current school, if it is active */
const sendResetIn = async (school, address) => {
  const ctx = { tenantId: school.id, role: "SYSTEM" };
  const user = await accountService.credentials.find(ctx, address);
  if (!user || user.status !== "ACTIVE") return;
  const token = await issueToken(ctx, user.id, "RESET", null);
  await email.send(authEmails.reset({ user, school, token, hours: TOKEN_TTL_HOURS.RESET }));
};

/* Spend a link, inside its school's databases */
const spendLink = async ({ token, password }) => {
  /* Cheap check first: no 32 MB hash for a link that cannot work */
  const known = await authTokenRepository.findUsable(digest(token));
  if (!known) throw unprocessable(LINK_INVALID);
  const passwordHash = await hashPassword(password);
  const outcome = await transaction(async tx => {
    const row = await authTokenRepository.lockByHash(digest(token), { dbc: tx });
    if (!row || row.usedAt || new Date(row.expiresAt) <= new Date()) return { error: LINK_INVALID };
    const ctx = { tenantId: row.tenantId, role: "SYSTEM" };
    const [user] = await accountService.findManyByIds(ctx, [row.userId]);
    if (!user || user.status !== "ACTIVE") return { error: LINK_INVALID };

    await accountService.credentials.setPasswordHash(ctx, user.id, passwordHash, { dbc: tx });
    await authTokenRepository.spendUnused(row.tenantId, user.id, { dbc: tx });
    await sessionService.revokeAllForUser(ctx, user.id, { reason: "PASSWORD_RESET", dbc: tx });
    return { purpose: row.purpose, userId: user.id };
  });
  if (outcome.error) throw unprocessable(outcome.error);
  /* A reset may follow a stolen password: tokens already issued stop working.
       (A first password from an invitation has nothing to end.) */
  if (outcome.purpose === "RESET") await revokeUserTokens(outcome.userId);
  return outcome;
};

export const credentialService = {
  /* Email set-password links to accounts that have never had a password.
     Only ADMIN may invite privileged accounts. */
  invite: async (ctx, userIds) => {
    const accounts = await accountService.findManyByIds(ctx, [...new Set(userIds)]);
    const found = new Set(accounts.map(a => a.id));
    const missing = userIds.filter(id => !found.has(id));
    if (missing.length) throw unprocessable(`userIds not found: ${missing.join(", ")}`);
    if (ctx.role !== "ADMIN" && accounts.some(a => ROLE_GROUPS.STAFF_ROLES.includes(a.role))) {
      throw forbidden("Only an administrator can invite staff with privileged roles");
    }

    const school = await getTenant(ctx.tenantId);
    const invited = [];
    const skipped = [];
    for (const user of accounts) {
      if (user.status !== "ACTIVE") {
        skipped.push({ userId: user.id, reason: "The account is not active" });
      } else if (user.passwordChangedAt) {
        skipped.push({ userId: user.id, reason: "The account already has a password; use password reset" });
      } else {
        const token = await issueToken(ctx, user.id, "INVITE", ctx.userId);
        /* One address the provider refuses (or an outage) skips that person, with its reason,
           instead of failing the batch after the earlier ones were already sent */
        try {
          await email.send(authEmails.invite({ user, school, token, hours: TOKEN_TTL_HOURS.INVITE }));
          invited.push(user.id);
        } catch (err) {
          logger.warn({ err, userId: user.id, tenantId: ctx.tenantId }, "Invitation email not sent");
          skipped.push({ userId: user.id, email: user.email, reason: `The email couldn't be sent: ${err.response ?? err.message}` });
        }
      }
    }
    return { invited, skipped };
  },

  /* Job body for a reset request. The HTTP request only queues it, so the answer and its
     timing are the same whether or not the account exists.
     { schoolCode, email }: that school; { tenantId, email }: the current school (a request
     without a school code is split into one job per school, see credential.job.js) */
  sendResetLink: async ({ schoolCode, tenantId, email: address }) => {
    if (tenantId) return sendResetIn(await getTenant(tenantId), address);
    const school = await findTenantByCode(schoolCode);
    if (school) await runInTenant(school.id, async () => sendResetIn(await getTenant(school.id), address));
  },

  /* The schools a reset request without a school code goes to */
  resetSchools: address => accountService.credentials.schoolsFor(address),

  /* Spend an invitation or reset link: set the password and end every session */
  resetPassword: async ({ token, password }) => {
    const [tenantId] = String(token).split(".");
    if (!UUID.test(tenantId ?? "")) throw unprocessable(LINK_INVALID);
    try {
      return await runInTenant(tenantId, () => spendLink({ token, password }));
    } catch (error) {
      if (error.status === 404 || error.status === 403) throw unprocessable(LINK_INVALID);
      throw error;
    }
  },

  /* Signed in: change my password; my other devices are signed out */
  changePassword: async (ctx, { currentPassword, newPassword }, client) => {
    const user = await accountService.credentials.findById(ctx, ctx.userId);
    /* Guessing the current password with a stolen access token is limited like sign-in */
    const attempt = { tenantKey: ctx.tenantId, email: user?.email ?? ctx.userId, ip: client.ipAddress ?? "unknown" };
    await signInThrottle.claim(attempt);
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw unprocessable("The current password is incorrect");
    }
    await signInThrottle.clear(attempt);
    if (currentPassword === newPassword) throw unprocessable("The new password must be different from the current one");
    const passwordHash = await hashPassword(newPassword);
    return transaction(async tx => {
      await accountService.credentials.setPasswordHash(ctx, ctx.userId, passwordHash, { dbc: tx });
      /* Reset links requested before the change stop working */
      await authTokenRepository.spendUnused(ctx.tenantId, ctx.userId, { dbc: tx });
      return sessionService.revokeAllForUser(ctx, ctx.userId, {
        exceptId: ctx.sessionId,
        reason: "PASSWORD_CHANGED",
        dbc: tx
      });
    });
  },

  /* The account's email changed (by the office): the old address is told, earlier links
     stop working and every session ends, so a changed email cannot be used to take over
     an account quietly through password reset. */
  emailChanged: async ({ tenantId, userId, oldEmail, newEmail }) => {
    const ctx = { tenantId, role: "SYSTEM" };
    const [user] = await accountService.findManyByIds(ctx, [userId]);
    const school = await getTenant(tenantId);
    await transaction(async tx => {
      await authTokenRepository.spendUnused(tenantId, userId, { dbc: tx });
      await sessionService.revokeAllForUser(ctx, userId, { reason: "EMAIL_CHANGED", dbc: tx });
    });
    await revokeUserTokens(userId);
    if (user && oldEmail) await email.send(authEmails.emailChanged({ user, school, oldEmail, newEmail }));
  }
};
