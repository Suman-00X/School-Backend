import { relations, sql } from "drizzle-orm";
import { check, date, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { hostels } from "../../hostels/models/hostel.schema.js";
import { hostelRooms } from "../../rooms/models/hostelRoom.schema.js";
import { ALLOCATION_SOURCES, BOOKING_STATUSES, END_REASONS } from "../../shared/constants/hostel.constants.js";

export const hostelBookingStatus = pgEnum("hostel_booking_status", BOOKING_STATUSES);
export const hostelAllocationSource = pgEnum("hostel_allocation_source", ALLOCATION_SOURCES);
export const hostelEndReason = pgEnum("hostel_end_reason", END_REASONS);

/* A student's bed for a date range [from_date, to_date] (to_date null = open-ended).
   Not tied to an academic year: beds can be booked ahead and changed over between years.
   The database refuses overlaps (hand-written exclusion constraints, btree_gist):
     hostel_allocations_bed_no_overlap      one bed, one ACTIVE allocation per day
     hostel_allocations_student_no_overlap  one student, one ACTIVE allocation per day
   Ending early shortens to_date; cancelling keeps the row as history (status CANCELLED). */
export const hostelAllocations = pgTable(
  "hostel_allocations",
  {
    ...baseColumns(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    /* The room's hostel, copied for filtering and reports */
    hostelId: uuid("hostel_id")
      .notNull()
      .references(() => hostels.id),
    roomId: uuid("room_id")
      .notNull()
      .references(() => hostelRooms.id),
    bedNumber: integer("bed_number").notNull(),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date"),
    status: hostelBookingStatus("status").notNull().default("ACTIVE"),
    source: hostelAllocationSource("source").notNull().default("DIRECT"),
    /* The allocation this one continues (the bed before a transfer, last year's bed for a roll-over) */
    previousAllocationId: uuid("previous_allocation_id").references(() => hostelAllocations.id),
    /* Set when an action (vacate, transfer, leaving, cancellation) ended the allocation */
    endReason: hostelEndReason("end_reason"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedBy: uuid("ended_by").references(() => users.id),
    allocatedBy: uuid("allocated_by").references(() => users.id),
    notes: text("notes")
  },
  t => [
    index("hostel_allocations_tenant_hostel_idx").on(t.tenantId, t.hostelId, t.fromDate),
    index("hostel_allocations_room_idx").on(t.roomId, t.bedNumber),
    index("hostel_allocations_student_idx").on(t.studentId, t.fromDate),
    check("hostel_allocations_bed_chk", sql`${t.bedNumber} >= 1`),
    check("hostel_allocations_dates_chk", sql`${t.toDate} IS NULL OR ${t.toDate} >= ${t.fromDate}`),
    check(
      "hostel_allocations_cancelled_chk",
      sql`${t.status} <> 'CANCELLED' OR (${t.endReason} IS NOT NULL AND ${t.endedAt} IS NOT NULL)`
    )
  ]
);

export const hostelAllocationsRelations = relations(hostelAllocations, ({ one }) => ({
  student: one(students, { fields: [hostelAllocations.studentId], references: [students.id] }),
  hostel: one(hostels, { fields: [hostelAllocations.hostelId], references: [hostels.id] }),
  room: one(hostelRooms, { fields: [hostelAllocations.roomId], references: [hostelRooms.id] })
}));
