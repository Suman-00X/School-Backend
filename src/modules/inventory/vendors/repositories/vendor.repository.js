import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { inventoryVendors } from "../models/vendor.schema.js";

export const vendorRepository = createRepository({
  table: inventoryVendors,
  queryKey: "inventoryVendors",
  orderBy: asc(inventoryVendors.name)
});

describeDuplicates({
  inventory_vendors_tenant_tax_id_uq: ({ taxId }) => `A vendor with tax id ${taxId} already exists`
});
