import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { hostels } from "../../hostels/models/hostel.schema.js";
import { hostelRooms } from "../../rooms/models/hostelRoom.schema.js";
import {
  MAX_RESOURCE_CAPACITY,
  PLAN_TYPES,
  RESOURCE_STATUSES,
  RESOURCE_TYPES
} from "../../shared/constants/hostel.constants.js";
import { money } from "../../shared/models/money.columns.js";

export const hostelResourceType = pgEnum("hostel_resource_type", RESOURCE_TYPES);
export const hostelResourceStatus = pgEnum("hostel_resource_status", RESOURCE_STATUSES);

const planList = sql.raw(PLAN_TYPES.map(type => `'${type}'`).join(", "));

/* Something a hostel assigns to students by date range, besides beds: a locker or cupboard
   in a room, or a hostel-wide mess or laundry plan. `capacity` is how many students may hold it
   on the same day (a locker 1, a mess plan many). The fee is stored, not invoiced. */
export const hostelResources = pgTable(
  "hostel_resources",
  {
    ...baseColumns(),
    hostelId: uuid("hostel_id")
      .notNull()
      .references(() => hostels.id),
    /* null: hostel-wide (plans, a corridor locker bank) */
    roomId: uuid("room_id").references(() => hostelRooms.id),
    resourceType: hostelResourceType("resource_type").notNull(),
    /* What a CUSTOM resource is ("Bicycle stand") */
    customType: text("custom_type"),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull(),
    monthlyFee: money("monthly_fee").notNull().default(0),
    status: hostelResourceStatus("status").notNull().default("AVAILABLE"),
    description: text("description")
  },
  t => [
    uniqueIndex("hostel_resources_hostel_name_uq")
      .on(t.hostelId, sql`lower(${t.name})`)
      .where(activeRows(t)),
    index("hostel_resources_tenant_hostel_idx").on(t.tenantId, t.hostelId, t.resourceType),
    index("hostel_resources_room_idx").on(t.roomId),
    check("hostel_resources_capacity_chk", sql`${t.capacity} BETWEEN 1 AND ${sql.raw(String(MAX_RESOURCE_CAPACITY))}`),
    check("hostel_resources_fee_chk", sql`${t.monthlyFee} >= 0`),
    check("hostel_resources_custom_chk", sql`(${t.resourceType} = 'CUSTOM') = (${t.customType} IS NOT NULL)`),
    check("hostel_resources_plan_room_chk", sql`${t.resourceType} NOT IN (${planList}) OR ${t.roomId} IS NULL`)
  ]
);

export const hostelResourcesRelations = relations(hostelResources, ({ one }) => ({
  hostel: one(hostels, { fields: [hostelResources.hostelId], references: [hostels.id] }),
  room: one(hostelRooms, { fields: [hostelResources.roomId], references: [hostelRooms.id] })
}));
