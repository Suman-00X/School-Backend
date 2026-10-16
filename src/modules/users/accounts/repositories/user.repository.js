import { and, eq } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { users } from "../models/user.schema.js";

const base = createRepository({
  table: users,
  queryKey: "users",
  hiddenColumns: ["passwordHash"]
});

export const userRepository = {
  ...base,

  /* Sign-in only: the account with its password hash and lockout state */
  findCredentials: async (tenantId, email) => {
    const [user] = await db
      .select()
      .from(users)
      .where(scoped(users, tenantId, eq(users.email, email)))
      .limit(1);
    return user ?? null;
  },

  findCredentialsById: async (tenantId, userId) => {
    const [user] = await db
      .select()
      .from(users)
      .where(scoped(users, tenantId, eq(users.id, userId)))
      .limit(1);
    return user ?? null;
  },

  recordLogin: (tenantId, userId, extra = {}) =>
    db
      .update(users)
      .set({ lastLoginAt: new Date(), ...extra })
      .where(and(eq(users.tenantId, tenantId), eq(users.id, userId))),

  setPasswordHash: (tenantId, userId, passwordHash, { dbc = db } = {}) =>
    dbc
      .update(users)
      .set({ passwordHash, passwordChangedAt: new Date() })
      .where(scoped(users, tenantId, eq(users.id, userId)))
};
