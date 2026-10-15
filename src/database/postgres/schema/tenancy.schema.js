import { integer, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { isActive, primaryId, timestamps } from "./columns.js";

/* One row per school. Every other table carries tenant_id. */
export const tenants = pgTable("tenants", {
  id: primaryId(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  address: text("address"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  description: text("description"),
  isActive: isActive(),
  ...timestamps()
});

export const tenantId = () => uuid("tenant_id").notNull().references(() => tenants.id);

/* Per-tenant counters behind generated codes (student, teacher, roll numbers...) */
export const serialCounters = pgTable(
  "serial_counters",
  {
    tenantId: tenantId(),
    scope: text("scope").notNull(),
    seq: integer("seq").notNull().default(0),
    ...timestamps()
  },
  t => [primaryKey({ columns: [t.tenantId, t.scope] })]
);
