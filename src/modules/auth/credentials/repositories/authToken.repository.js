import { and, eq, isNull } from "drizzle-orm";
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

  /* Older unused links stop working when a new one is sent or a password is set */
  spendUnused: (tenantId, userId, { dbc }) =>
    dbc
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(scoped(authTokens, tenantId, eq(authTokens.userId, userId), isNull(authTokens.usedAt)))
};
