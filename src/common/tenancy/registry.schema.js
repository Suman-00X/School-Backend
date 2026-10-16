import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/* The PLATFORM database (DATABASE_URL) holds only this: which schools exist and where
   their data lives. Every school's records are in the school's own PostgreSQL and
   MongoDB databases (one per school). */
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
