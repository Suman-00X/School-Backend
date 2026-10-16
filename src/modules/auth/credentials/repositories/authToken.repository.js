import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { authTokens } from "../models/authToken.schema.js";

const base = createRepository({ table: authTokens, queryKey: "authTokens", hiddenColumns: ["tokenHash"] });

export const authTokenRepository = {
  ...base,

  /* A link names no school: the token digest finds the row (unique, unguessable) */
  lockByHash: async (tokenHash, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.isActive, true)))
      .for("update");
    return row ?? null;
  },

  /* Unlocked look-up of a link that can still be spent (null otherwise) */
  findUsable: async tokenHash => {
    const [row] = await db
      .select({ id: authTokens.id })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.tokenHash, tokenHash),
          eq(authTokens.isActive, true),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, new Date())
        )
      )
      .limit(1);
    return row ?? null;
  },

  /* Older unused links stop working when a new one is sent or a password is set */
  spendUnused: (tenantId, userId, { dbc }) =>
    dbc
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(scoped(authTokens, tenantId, eq(authTokens.userId, userId), isNull(authTokens.usedAt)))
};
