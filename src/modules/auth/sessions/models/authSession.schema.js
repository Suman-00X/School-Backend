import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";

/* One signed-in device. The refresh token is "<session id>.<secret>"; only the
   secret's digest is stored. It rotates on every refresh, and the previous digest
   is kept so a replayed (stolen) token can be detected and the session closed. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    ...baseColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    refreshHash: text("refresh_hash").notNull(),
    previousRefreshHash: text("previous_refresh_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address")
  },
  t => [index("auth_sessions_user_idx").on(t.tenantId, t.userId)]
);
