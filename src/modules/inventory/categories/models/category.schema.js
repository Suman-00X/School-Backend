import { sql } from "drizzle-orm";
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";

/* Groups of stock items: Stationery, Lab supplies, Cleaning… */
export const inventoryCategories = pgTable(
  "inventory_categories",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    description: text("description")
  },
  t => [
    /* Case-insensitive: "Stationery" and "stationery" are the same category */
    uniqueIndex("inventory_categories_tenant_name_uq")
      .on(t.tenantId, sql`lower(${t.name})`)
      .where(activeRows(t))
  ]
);
