import { boolean, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

/* Platform tables used by the framework itself (not by any one module) */

/* One row per school. Every module table carries tenant_id -> tenants.id */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  address: text("address"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  description: text("description"),
  /* IANA time zone: decides "today" for attendance, due dates, schedules */
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  /* ISO 4217 currency for fees and payroll */
  currency: text("currency").notNull().default("INR"),
  country: text("country").notNull().default("IN"),
  logoKey: text("logo_key"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
});

/* Per-tenant counters behind generated codes (see sequences/) */
export const serialCounters = pgTable(
  "serial_counters",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    scope: text("scope").notNull(),
    seq: integer("seq").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date())
  },
  t => [primaryKey({ columns: [t.tenantId, t.scope] })]
);
