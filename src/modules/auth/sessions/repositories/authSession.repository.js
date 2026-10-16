import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { authSessions } from "../models/authSession.schema.js";

const base = createRepository({
  table: authSessions,
  queryKey: "authSessions",
  hiddenColumns: ["refreshHash", "previousRefreshHash"]
});

/* Sessions that can still be refreshed */
const live = () => and(isNull(authSessions.revokedAt), gt(authSessions.expiresAt, new Date()));

export const authSessionRepository = {
  ...base,

  /* Refresh: the refresh token names its session; the school comes from the row.
     Lookup is by an unguessable id plus the secret check in the service. */
  lockById: async (sessionId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(authSessions)
      .where(and(eq(authSessions.id, sessionId), eq(authSessions.isActive, true)))
      .for("update");
    return row ?? null;
  },

  listLive: (tenantId, userId) => base.findMany(tenantId, { conditions: [eq(authSessions.userId, userId), live()] }),

  /* Revoke a user's live sessions (all, or all but one) -> revoked ids */
  revokeAll: async (tenantId, userId, { exceptId, reason, dbc }) => {
    const rows = await dbc
      .update(authSessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(
        scoped(
          authSessions,
          tenantId,
          eq(authSessions.userId, userId),
          live(),
          exceptId ? ne(authSessions.id, exceptId) : undefined
        )
      )
      .returning({ id: authSessions.id });
    return rows.map(row => row.id);
  }
};
