import { asc, eq } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { hostels } from "../models/hostel.schema.js";

const base = createRepository({
  table: hostels,
  queryKey: "hostels",
  orderBy: asc(hostels.name)
});

export const hostelRepository = {
  ...base,

  /* Hostels whose warden is this user, moved to another warden -> [{ id, name, code }] */
  reassignWarden: (tenantId, fromUserId, toUserId, { dbc }) =>
    dbc
      .update(hostels)
      .set({ wardenUserId: toUserId })
      .where(scoped(hostels, tenantId, eq(hostels.wardenUserId, fromUserId)))
      .returning({ id: hostels.id, name: hostels.name, code: hostels.code })
};
