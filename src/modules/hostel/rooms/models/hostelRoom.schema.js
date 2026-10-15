import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { hostels } from "../../hostels/models/hostel.schema.js";
import { MAX_ROOM_CAPACITY, ROOM_STATUSES } from "../../shared/constants/hostel.constants.js";
import { money } from "../../shared/models/money.columns.js";

export const hostelRoomStatus = pgEnum("hostel_room_status", ROOM_STATUSES);

/* A room in a hostel. Its beds are numbered 1..capacity. */
export const hostelRooms = pgTable(
  "hostel_rooms",
  {
    ...baseColumns(),
    hostelId: uuid("hostel_id")
      .notNull()
      .references(() => hostels.id),
    roomNumber: text("room_number").notNull(),
    floor: integer("floor"),
    capacity: integer("capacity").notNull(),
    /* Free text: "AC", "Non-AC", "Dormitory" */
    roomType: text("room_type"),
    monthlyFee: money("monthly_fee").notNull().default(0),
    status: hostelRoomStatus("status").notNull().default("AVAILABLE"),
    description: text("description")
  },
  t => [
    uniqueIndex("hostel_rooms_hostel_number_uq").on(t.hostelId, t.roomNumber).where(activeRows(t)),
    index("hostel_rooms_tenant_hostel_idx").on(t.tenantId, t.hostelId),
    check("hostel_rooms_capacity_chk", sql`${t.capacity} BETWEEN 1 AND ${sql.raw(String(MAX_ROOM_CAPACITY))}`),
    check("hostel_rooms_fee_chk", sql`${t.monthlyFee} >= 0`)
  ]
);

export const hostelRoomsRelations = relations(hostelRooms, ({ one }) => ({
  hostel: one(hostels, { fields: [hostelRooms.hostelId], references: [hostels.id] })
}));
