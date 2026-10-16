import { revokeUserTokens } from "../../../../common/auth/revocation.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";
import { hashPassword, verifyPassword } from "../../../../common/crypto/password.js";
import { digest, randomToken } from "../../../../common/crypto/tokens.js";
import { transaction } from "../../../../common/database/postgres.js";
import { forbidden, unprocessable } from "../../../../common/http/errors.js";
import { email } from "../../../../common/messaging/email.js";
import { findTenantByCode, getTenant } from "../../../../common/tenancy/tenant.service.js";
import { accountService } from "../../../users/accounts/index.js";
import { sessionService } from "../../sessions/index.js";
import { TOKEN_TTL_HOURS } from "../../shared/constants/auth.constants.js";
import { authEmails } from "../../shared/utils/authEmails.util.js";
import { authTokenRepository } from "../repositories/authToken.repository.js";

const LINK_INVALID = "This link is invalid or has expired. Ask for a new one.";

/* New single-use link; earlier unused links of the user stop working */
const issueToken = (ctx, userId, purpose, createdBy) =>
  transaction(async tx => {
    await authTokenRepository.spendUnused(ctx.tenantId, userId, { dbc: tx });
    const token = randomToken();
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
        await email.send(authEmails.invite({ user, school, token, hours: TOKEN_TTL_HOURS.INVITE }));
        invited.push(user.id);
      }
    }
    return { invited, skipped };
  },

  /* Always the same answer, whether or not the account exists */
  requestReset: async ({ schoolCode, email: address }) => {
    const school = await findTenantByCode(schoolCode);
    if (!school) return;
    const ctx = { tenantId: school.id, role: "SYSTEM" };
    const user = await accountService.credentials.find(ctx, address);
    if (!user || user.status !== "ACTIVE") return;
    const token = await issueToken(ctx, user.id, "RESET", null);
    await email.send(authEmails.reset({ user, school, token, hours: TOKEN_TTL_HOURS.RESET }));
  },

  /* Spend an invitation or reset link: set the password and end every session */
  resetPassword: async ({ token, password }) => {
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
  },

  /* Signed in: change my password; my other devices are signed out */
  changePassword: async (ctx, { currentPassword, newPassword }) => {
    const user = await accountService.credentials.findById(ctx, ctx.userId);
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw unprocessable("The current password is incorrect");
    }
    if (currentPassword === newPassword) throw unprocessable("The new password must be different from the current one");
    const passwordHash = await hashPassword(newPassword);
    return transaction(async tx => {
      await accountService.credentials.setPasswordHash(ctx, ctx.userId, passwordHash, { dbc: tx });
      return sessionService.revokeAllForUser(ctx, ctx.userId, {
        exceptId: ctx.sessionId,
        reason: "PASSWORD_CHANGED",
        dbc: tx
      });
    });
  }
};
