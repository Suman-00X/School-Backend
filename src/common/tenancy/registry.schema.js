import { index, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/* The PLATFORM database (DATABASE_URL) holds only this: which schools exist, where their
   data lives, and which schools a sign-in email has an account in. Every school's records
   are in the school's own PostgreSQL and MongoDB databases (one per school). */
export const platformTenantStatus = pgEnum("platform_tenant_status", ["ACTIVE", "SUSPENDED"]);

export const platformTenants = pgTable(
  "platform_tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: platformTenantStatus("status").notNull().default("ACTIVE"),
    /* Database names on the shared servers (from the URL templates)... */
    databaseName: text("database_name").notNull(),
    mongoDatabaseName: text("mongo_database_name").notNull(),
    /* ...or a school's own connection strings, encrypted (enc:v1:…), when given */
    databaseUrl: text("database_url"),
    mongoUrl: text("mongo_url"),
    /* Modules switched on for the school (see tenancy/moduleSwitches.js); null: every module */
    enabledModules: text("enabled_modules").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date())
  },
  t => [
    uniqueIndex("platform_tenants_code_uq").on(t.code),
    uniqueIndex("platform_tenants_database_uq").on(t.databaseName)
  ]
);

/* The login directory: one row per account, so sign-in can find a person's schools from
   their email alone. Only a keyed digest of the email is stored (HMAC-SHA256, see
   tenancy/directory.js), never the address. A copy of what the schools' own databases say:
   it can always be rebuilt from them (npm run directory:rebuild). */
export const platformAccountDirectory = pgTable(
  "platform_account_directory",
  {
    emailDigest: text("email_digest").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => platformTenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  t => [
    /* A school has one account per email (users_tenant_email_uq in the school database) */
    primaryKey({ columns: [t.emailDigest, t.tenantId] }),
    index("platform_account_directory_user_idx").on(t.tenantId, t.userId)
  ]
);
