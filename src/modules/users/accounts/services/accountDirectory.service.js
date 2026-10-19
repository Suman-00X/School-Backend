import { logger } from "../../../../common/logging/logger.js";
import { listTenantRecords, runInTenant } from "../../../../common/tenancy/context.js";
import { loginDirectory } from "../../../../common/tenancy/directory.js";
import { userRepository } from "../repositories/user.repository.js";

/* Keeps the platform login directory (which schools have an account for an email) in step
   with this school's accounts. The account service calls it on every create, email change
   and deactivation; rebuild() recomputes a school from its users table.

   Which accounts are listed: every account that has not been deactivated, whatever its
   status, so a BLOCKED account still gets "This account is disabled" at sign-in.
   Deactivated (removed) accounts cannot sign in at all and are dropped. */

const MAX_SCHOOLS = 20;

/* Writes after the school's change has committed: a failure is logged, not raised (the
   change itself stands), and the next rebuild or sign-in with a school code repairs it */
const bestEffort = async (what, context, write) => {
  try {
    await write();
  } catch (error) {
    logger.error({ err: error, ...context }, `Login directory not updated (${what}); run npm run directory:rebuild`);
  }
};

export const accountDirectory = {
  /* A new account. Called inside the creating transaction, before it commits: a failure
     aborts the creation, and a rolled-back creation leaves a harmless row behind. */
  added: (tenantId, account) => loginDirectory.record(tenantId, account.id, account.email),

  emailChanged: (tenantId, userId, { oldEmail, newEmail }) =>
    bestEffort("email changed", { tenantId, userId }, async () => {
      await loginDirectory.record(tenantId, userId, newEmail);
      await loginDirectory.forget(tenantId, userId, oldEmail);
    }),

  deactivated: (tenantId, userId) =>
    bestEffort("account deactivated", { tenantId, userId }, () => loginDirectory.forget(tenantId, userId)),

  /* Sign-in with a school code proved this account: make sure it is listed */
  signedIn: (tenantId, user) =>
    bestEffort("sign-in", { tenantId, userId: user.id }, () => loginDirectory.ensure(tenantId, user.id, user.email)),

  /* For sign-in: active schools with an account for this email (at most 20) */
  schoolsFor: email => loginDirectory.schoolsFor(email, { limit: MAX_SCHOOLS }),

  /* Recompute one school's rows from its users table -> { accounts, removed } */
  rebuild: async tenantId => {
    const accounts = await runInTenant(tenantId, () => userRepository.listSignInEmails(tenantId));
    return loginDirectory.replaceSchool(tenantId, accounts);
  },

  /* Every active school, one after another; a failing school is reported and skipped.
     Suspended schools keep their rows (sign-in skips them until they are active again). */
  rebuildAll: async () => {
    const results = [];
    for (const record of await listTenantRecords({ status: "ACTIVE" })) {
      try {
        results.push({ code: record.code, ok: true, ...(await accountDirectory.rebuild(record.id)) });
      } catch (error) {
        logger.error({ err: error, tenant: record.code }, "Login directory rebuild failed");
        results.push({ code: record.code, ok: false, error: error.message });
      }
    }
    return results;
  }
};
