import { and, eq, sql } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { users } from "../models/user.schema.js";

const base = createRepository({
  table: users,
  queryKey: "users",
  hiddenColumns: ["passwordHash", "failedLoginCount", "lockedUntil"]
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

  /* One more wrong password, atomically; locks the account at `maxFailures` */
  recordFailedLogin: async (tenantId, userId, { maxFailures, lockoutMinutes }) => {
    const [user] = await db
      .update(users)
      .set({
        failedLoginCount: sql`${users.failedLoginCount} + 1`,
        lockedUntil: sql`CASE WHEN ${users.failedLoginCount} + 1 >= ${maxFailures}
          THEN now() + make_interval(mins => ${lockoutMinutes}) ELSE ${users.lockedUntil} END`
      })
      .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)))
      .returning({ failedLoginCount: users.failedLoginCount, lockedUntil: users.lockedUntil });
    return user;
  },

  recordLogin: (tenantId, userId, extra = {}) =>
    db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), ...extra })
      .where(and(eq(users.tenantId, tenantId), eq(users.id, userId))),

  setPasswordHash: (tenantId, userId, passwordHash, { dbc = db } = {}) =>
    dbc
      .update(users)
      .set({ passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null })
      .where(scoped(users, tenantId, eq(users.id, userId)))
};
