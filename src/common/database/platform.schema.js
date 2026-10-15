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
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
});

/* Per-tenant counters behind generated codes (see sequences/) */
export const serialCounters = pgTable(
  "serial_counters",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    scope: text("scope").notNull(),
    seq: integer("seq").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
  },
  t => [primaryKey({ columns: [t.tenantId, t.scope] })]
);
