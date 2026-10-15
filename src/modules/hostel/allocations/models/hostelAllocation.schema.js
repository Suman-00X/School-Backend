import { relations, sql } from "drizzle-orm";
import { check, date, index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { academicYears } from "../../../academics/academic-years/models/academicYear.schema.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { hostels } from "../../hostels/models/hostel.schema.js";
import { hostelRooms } from "../../rooms/models/hostelRoom.schema.js";
import { ALLOCATION_STATUSES } from "../../shared/constants/hostel.constants.js";

export const hostelAllocationStatus = pgEnum("hostel_allocation_status", ALLOCATION_STATUSES);

/* A student's bed for an academic year. Vacating keeps the row (status VACATED)
   as history; a transfer vacates one row and starts another. */
export const hostelAllocations = pgTable(
  "hostel_allocations",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
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
    allocatedOn: date("allocated_on").notNull(),
    vacatedOn: date("vacated_on"),
    status: hostelAllocationStatus("status").notNull().default("ACTIVE"),
    /* The allocation this one replaced when the student was transferred */
    transferredFromId: uuid("transferred_from_id").references(() => hostelAllocations.id),
    allocatedBy: uuid("allocated_by").references(() => users.id),
    vacatedBy: uuid("vacated_by").references(() => users.id),
    notes: text("notes")
  },
  t => [
    /* One bed per student per year, and one student per bed */
    /* One bed per student at a time, across years (beds are physical) */
    uniqueIndex("hostel_allocations_student_uq")
      .on(t.studentId)
      .where(sql`${t.isActive} = true AND ${t.status} = 'ACTIVE'`),
    uniqueIndex("hostel_allocations_room_bed_uq")
      .on(t.roomId, t.bedNumber)
      .where(sql`${t.isActive} = true AND ${t.status} = 'ACTIVE'`),
    index("hostel_allocations_tenant_year_idx").on(t.tenantId, t.academicYearId, t.hostelId),
    index("hostel_allocations_student_idx").on(t.studentId),
    check("hostel_allocations_bed_chk", sql`${t.bedNumber} >= 1`),
    check(
      "hostel_allocations_vacated_chk",
      sql`(${t.status} = 'ACTIVE' AND ${t.vacatedOn} IS NULL) OR (${t.status} = 'VACATED' AND ${t.vacatedOn} >= ${t.allocatedOn})`
    )
  ]
);

export const hostelAllocationsRelations = relations(hostelAllocations, ({ one }) => ({
  student: one(students, { fields: [hostelAllocations.studentId], references: [students.id] }),
  hostel: one(hostels, { fields: [hostelAllocations.hostelId], references: [hostels.id] }),
  room: one(hostelRooms, { fields: [hostelAllocations.roomId], references: [hostelRooms.id] })
}));
