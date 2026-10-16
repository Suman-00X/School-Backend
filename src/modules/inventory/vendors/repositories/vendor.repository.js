import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { inventoryVendors } from "../models/vendor.schema.js";

export const vendorRepository = createRepository({
  table: inventoryVendors,
  queryKey: "inventoryVendors",
  orderBy: asc(inventoryVendors.name)
});
