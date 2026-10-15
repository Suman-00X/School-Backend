import { desc, eq } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { hostelAllocations } from "../models/hostelAllocation.schema.js";

const base = createRepository({
  table: hostelAllocations,
  queryKey: "hostelAllocations",
  orderBy: [desc(hostelAllocations.allocatedOn), desc(hostelAllocations.createdAt)]
});

export const hostelAllocationRepository = {
  ...base,

  /* Lock one allocation for the rest of the transaction (vacate, transfer) */
  lockForUpdate: async (tenantId, allocationId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(hostelAllocations)
      .where(scoped(hostelAllocations, tenantId, eq(hostelAllocations.id, allocationId)))
      .for("update");
    return row ?? null;
  }
};
