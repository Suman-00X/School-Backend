import { asc, eq, inArray } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { hostelResources } from "../models/hostelResource.schema.js";

const base = createRepository({
  table: hostelResources,
  queryKey: "hostelResources",
  orderBy: [asc(hostelResources.resourceType), asc(hostelResources.name)]
});

export const hostelResourceRepository = {
  ...base,

  /* Lock resources for the rest of the transaction (assignments, capacity changes).
     Locked in id order so two transactions never wait on each other in a cycle. */
  lockForUpdate: async (tenantId, resourceIds, { dbc }) =>
    resourceIds.length
      ? dbc
          .select()
          .from(hostelResources)
          .where(scoped(hostelResources, tenantId, inArray(hostelResources.id, resourceIds)))
          .orderBy(asc(hostelResources.id))
          .for("update")
      : [],

  /* Soft-delete every resource of a room, or of a hostel */
  softDeleteFor: (tenantId, { roomId, hostelId }, { dbc }) =>
    dbc
      .update(hostelResources)
      .set({ isActive: false })
      .where(
        scoped(
          hostelResources,
          tenantId,
          roomId ? eq(hostelResources.roomId, roomId) : eq(hostelResources.hostelId, hostelId)
        )
      )
};
