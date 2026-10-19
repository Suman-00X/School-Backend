import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { asc, eq } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { inventoryItems } from "../../items/models/item.schema.js";
import { inventoryCategories } from "../models/category.schema.js";

export const categoryRepository = {
  ...createRepository({
    table: inventoryCategories,
    queryKey: "inventoryCategories",
    orderBy: asc(inventoryCategories.name)
  }),

  /* Active items filed under a category */
  countItems: (tenantId, categoryId, { dbc = db } = {}) =>
    dbc.$count(inventoryItems, scoped(inventoryItems, tenantId, eq(inventoryItems.categoryId, categoryId)))
};

describeDuplicates({
  inventory_categories_tenant_name_uq: ({ name }) => `A category named ${name} already exists`
});
