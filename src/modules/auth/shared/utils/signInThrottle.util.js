import env from "../../../../common/config/env.config.js";
import { cache } from "../../../../common/cache/cache.js";
import { tooManyRequests } from "../../../../common/http/errors.js";

/* Password-guessing protection, shared by all API instances through the cache.
   - An attempt is claimed BEFORE the password is checked, so parallel bursts count.
   - Two counters per account: from this IP (low limit), and from anywhere (higher limit,
     against distributed guessing). One attacker IP therefore cannot lock the owner out;
     only a distributed attack reaching the account-wide limit can, for one window.
   - Unknown emails are counted the same way, so the answers reveal no accounts.
   - A successful sign-in clears the counters. */

const windowSeconds = () => env.auth.lockoutMinutes * 60;
const accountKey = (tenantKey, email) => `auth:attempts:${tenantKey}:${String(email).trim().toLowerCase()}`;
const LIMIT_FROM_ANYWHERE = 10;

export const signInThrottle = {
  /* Throws 429 when the limit is reached; otherwise records the attempt */
  claim: async ({ tenantKey, email, ip }) => {
    const key = accountKey(tenantKey, email);
    const [fromIp, fromAnywhere] = await Promise.all([
      cache.increment(`${key}:ip:${ip}`, windowSeconds()),
      cache.increment(key, windowSeconds())
    ]);
    const blocked =
      fromIp.value > env.auth.maxFailedLogins
        ? fromIp
        : fromAnywhere.value > env.auth.maxFailedLogins * LIMIT_FROM_ANYWHERE
          ? fromAnywhere
          : null;
    if (blocked) {
      throw tooManyRequests(
        `Too many sign-in attempts. Try again in ${Math.max(1, Math.ceil(blocked.ttlSeconds / 60))} minute(s), or reset your password.`
      );
    }
  },

  clear: ({ tenantKey, email, ip }) => {
    const key = accountKey(tenantKey, email);
    return Promise.all([cache.del(`${key}:ip:${ip}`), cache.del(key)]);
  }
};
