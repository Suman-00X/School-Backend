import env from "../../../../common/config/env.config.js";
import { strictRateLimit } from "../../../../common/http/security.js";

const window = { windowMs: env.auth.rateLimitWindowMs, limit: env.auth.rateLimitMax };

/* Per IP and email: password guessing and reset-link spam */
export const accountRateLimit = strictRateLimit({ ...window, keyField: "email" });

/* Per IP: refresh and link redemption */
export const ipRateLimit = strictRateLimit({ ...window, limit: window.limit * 5 });
