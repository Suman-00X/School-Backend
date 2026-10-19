import { and, eq, lt, sql } from "drizzle-orm";
import { keyedDigest } from "../crypto/integrity.js";
import { platformDb } from "./context.js";
import { platformAccountDirectory as directory, platformTenants } from "./registry.schema.js";

/* The login directory (platform database): which schools have an account for a sign-in
   email, so a person signs in with email and password alone.

   - Only HMAC-SHA256(key, normalised email) is stored. The key is derived from the master
     key (DATA_ENCRYPTION_KEY, see crypto/keys.js); after changing that key, rebuild.
   - It is a copy of the schools' own users tables, written outside their transactions:
     a row may outlive an account whose creation rolled back (harmless: sign-in finds no
     account there), and replaceSchool() makes one school's rows exact again. */

const PURPOSE = "login-directory-email";
const BATCH = 1000;

export const normaliseEmail = email =>
  String(email ?? "")
    .trim()
    .toLowerCase();
export const emailDigest = email => keyedDigest(PURPOSE, normaliseEmail(email));

const rowFor = (tenantId, userId, email) => ({ emailDigest: emailDigest(email), tenantId, userId });

export const loginDirectory = {
  /* This school has an account with this email (insert or re-point; safe to repeat) */
  record: (tenantId, userId, email) =>
    platformDb()
      .insert(directory)
      .values(rowFor(tenantId, userId, email))
      .onConflictDoUpdate({
        target: [directory.emailDigest, directory.tenantId],
        set: { userId, updatedAt: sql`now()` }
      }),

  /* Only when missing (sign-in with a school code heals a row lost to a failed write) */
  ensure: (tenantId, userId, email) =>
    platformDb()
      .insert(directory)
      .values(rowFor(tenantId, userId, email))
      .onConflictDoNothing(),

  /* The account no longer signs in with this email (changed), or at all (no email given) */
  forget: (tenantId, userId, email) =>
    platformDb()
      .delete(directory)
      .where(
        and(
          eq(directory.tenantId, tenantId),
          eq(directory.userId, userId),
          email === undefined ? undefined : eq(directory.emailDigest, emailDigest(email))
        )
      ),

  /* Active schools with an account for this email -> [{ id, code, name }], by name */
  schoolsFor: (email, { limit }) =>
    platformDb()
      .select({ id: platformTenants.id, code: platformTenants.code, name: platformTenants.name })
      .from(directory)
      .innerJoin(platformTenants, eq(platformTenants.id, directory.tenantId))
      .where(and(eq(directory.emailDigest, emailDigest(email)), eq(platformTenants.status, "ACTIVE")))
      .orderBy(platformTenants.name, platformTenants.code)
      .limit(limit),

  /* Make one school's rows exactly `accounts` ([{ userId, email }]); idempotent.
     now() is the transaction's start time: every row written here carries it, and rows
     written by other connections after this started are kept. */
  replaceSchool: (tenantId, accounts) =>
    platformDb().transaction(async tx => {
      const rows = accounts.map(account => rowFor(tenantId, account.userId, account.email));
      for (let i = 0; i < rows.length; i += BATCH) {
        await tx
          .insert(directory)
          .values(rows.slice(i, i + BATCH))
          .onConflictDoUpdate({
            target: [directory.emailDigest, directory.tenantId],
            set: { userId: sql`excluded.user_id`, updatedAt: sql`now()` }
          });
      }
      const removed = await tx
        .delete(directory)
        .where(and(eq(directory.tenantId, tenantId), lt(directory.updatedAt, sql`now()`)))
        .returning({ userId: directory.userId });
      return { accounts: rows.length, removed: removed.length };
    })
};
