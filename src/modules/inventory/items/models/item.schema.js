import { relations, sql } from "drizzle-orm";
import { boolean, check, index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { inventoryCategories } from "../../categories/models/category.schema.js";
import { UNITS } from "../../shared/constants/inventory.constants.js";
import { money, quantity } from "../../shared/models/inventory.columns.js";

export const inventoryUnit = pgEnum("inventory_unit", UNITS);

/* A stock-keeping unit. stock_on_hand and average_unit_cost are maintained only by
   stock movements (inventory/stock), under a row lock on this row. */
export const inventoryItems = pgTable(
  "inventory_items",
  {
    ...baseColumns(),
    /* Upper-case, unique per school */
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => inventoryCategories.id),
    unit: inventoryUnit("unit").notNull(),
    reorderLevel: quantity("reorder_level").notNull().default(0),
    stockOnHand: quantity("stock_on_hand").notNull().default(0),
    /* Weighted average of receipts, rounded to 2 decimals */
    averageUnitCost: money("average_unit_cost").notNull().default(0),
    location: text("location"),
    description: text("description"),
    /* No longer bought: receipts are refused and it leaves the low-stock report; stock can still be issued */
    discontinued: boolean("discontinued").notNull().default(false)
  },
  t => [
    uniqueIndex("inventory_items_tenant_sku_uq").on(t.tenantId, t.sku).where(activeRows(t)),
    index("inventory_items_category_idx").on(t.tenantId, t.categoryId),
    check("inventory_items_stock_chk", sql`${t.stockOnHand} >= 0`),
    check("inventory_items_reorder_chk", sql`${t.reorderLevel} >= 0`),
    check("inventory_items_cost_chk", sql`${t.averageUnitCost} >= 0`)
  ]
);

export const inventoryItemsRelations = relations(inventoryItems, ({ one }) => ({
  category: one(inventoryCategories, { fields: [inventoryItems.categoryId], references: [inventoryCategories.id] })
}));
