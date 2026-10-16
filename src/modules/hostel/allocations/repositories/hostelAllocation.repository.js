import { asc, desc, eq, inArray } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { hostelAllocations } from "../models/hostelAllocation.schema.js";

const base = createRepository({
  table: hostelAllocations,
  queryKey: "hostelAllocations",
  orderBy: [desc(hostelAllocations.fromDate), desc(hostelAllocations.createdAt)]
});

export const hostelAllocationRepository = {
  ...base,

  /* Lock one allocation for the rest of the transaction (date changes, vacate, transfer) */
  lockForUpdate: async (tenantId, allocationId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(hostelAllocations)
      .where(scoped(hostelAllocations, tenantId, eq(hostelAllocations.id, allocationId)))
      .for("update");
    return row ?? null;
  },

  /* Lock several allocations, in id order so two transactions never wait on each other in a cycle */
  lockManyForUpdate: (tenantId, conditions, { dbc }) =>
    dbc
      .select()
      .from(hostelAllocations)
      .where(scoped(hostelAllocations, tenantId, ...conditions))
      .orderBy(asc(hostelAllocations.id))
      .for("update"),

  findManyByIds: (tenantId, ids, options = {}) =>
    ids.length ? base.findMany(tenantId, { ...options, conditions: [inArray(hostelAllocations.id, ids)] }) : []
};
