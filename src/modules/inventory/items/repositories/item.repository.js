import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { asc, eq } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { stockMovements } from "../../stock/models/stockMovement.schema.js";
import { inventoryItems } from "../models/item.schema.js";

export const itemRepository = {
  ...createRepository({
    table: inventoryItems,
    queryKey: "inventoryItems",
    orderBy: asc(inventoryItems.name)
  }),

  /* Lock an item for the rest of the transaction (stock movements) */
  lockForUpdate: async (tenantId, itemId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(inventoryItems)
      .where(scoped(inventoryItems, tenantId, eq(inventoryItems.id, itemId)))
      .for("update");
    return row ?? null;
  },

  /* True once any stock movement was recorded for the item */
  hasMovements: async (tenantId, itemId, { dbc = db } = {}) => {
    const [row] = await dbc
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(scoped(stockMovements, tenantId, eq(stockMovements.itemId, itemId)))
      .limit(1);
    return Boolean(row);
  }
};

describeDuplicates({
  inventory_items_tenant_sku_uq: ({ sku }) => `An item with SKU ${sku} already exists`
});
