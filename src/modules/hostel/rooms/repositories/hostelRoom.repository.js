import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { asc, eq, inArray } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { hostelRooms } from "../models/hostelRoom.schema.js";

const base = createRepository({
  table: hostelRooms,
  queryKey: "hostelRooms",
  orderBy: [asc(hostelRooms.floor), asc(hostelRooms.roomNumber)]
});

export const hostelRoomRepository = {
  ...base,

  /* Lock rooms for the rest of the transaction (bed allocation, capacity changes).
     Locked in id order so two transactions never wait on each other in a cycle. */
  lockForUpdate: async (tenantId, roomIds, { dbc }) =>
    dbc
      .select()
      .from(hostelRooms)
      .where(scoped(hostelRooms, tenantId, inArray(hostelRooms.id, roomIds)))
      .orderBy(asc(hostelRooms.id))
      .for("update"),

  /* Soft-delete every room of a hostel */
  softDeleteForHostel: (tenantId, hostelId, { dbc }) =>
    dbc
      .update(hostelRooms)
      .set({ isActive: false })
      .where(scoped(hostelRooms, tenantId, eq(hostelRooms.hostelId, hostelId)))
};

describeDuplicates({
  hostel_rooms_hostel_number_uq: ({ roomNumber }) => `Room ${roomNumber} already exists in this hostel`
});
