import { sql } from "drizzle-orm";
import { boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./platform.schema.js";

/* Column helpers every module table uses */

export const primaryId = () => uuid("id").primaryKey().defaultRandom();

export const tenantId = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id);

export const isActive = () => boolean("is_active").notNull().default(true);

export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
});

/* Standard columns: id, tenant_id, is_active, created_at, updated_at */
export const baseColumns = () => ({
  id: primaryId(),
  tenantId: tenantId(),
  isActive: isActive(),
  ...timestamps()
});

/* Partial-index predicate for soft-deletable uniques */
export const activeRows = table => sql`${table.isActive} = true`;
