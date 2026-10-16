import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, index } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { TOKEN_PURPOSES } from "../../shared/constants/auth.constants.js";

export const authTokenPurpose = pgEnum("auth_token_purpose", TOKEN_PURPOSES);

/* Single-use links: invitations (set a first password) and password resets.
   Only the digest is stored; a token is spent once (used_at) or expires. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    ...baseColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    purpose: authTokenPurpose("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id)
  },
  t => [uniqueIndex("auth_tokens_hash_uq").on(t.tokenHash), index("auth_tokens_user_idx").on(t.tenantId, t.userId)]
);
