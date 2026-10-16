import { relations, sql } from "drizzle-orm";
import { check, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import {
  hostelAllocations,
  hostelBookingStatus,
  hostelEndReason
} from "../../allocations/models/hostelAllocation.schema.js";
import { hostels } from "../../hostels/models/hostel.schema.js";
import { hostelResources } from "../../resources/models/hostelResource.schema.js";
import { PLAN_TYPES } from "../../shared/constants/hostel.constants.js";

const planList = sql.raw(PLAN_TYPES.map(type => `'${type}'`).join(", "));

/* A student holds a resource for [from_date, to_date] (to_date null = open-ended).
   Tied to a bed allocation (allocation_id), it ends with the bed; otherwise it stands alone.
   The resource row lock keeps the number of holders per day within its capacity, and the
   database refuses overlaps (hand-written exclusion constraints, btree_gist):
     hostel_resource_assignments_student_no_overlap  one student, one ACTIVE hold of a resource per day
     hostel_resource_assignments_plan_no_overlap     one student, one mess (or laundry) plan per day */
export const hostelResourceAssignments = pgTable(
  "hostel_resource_assignments",
  {
    ...baseColumns(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => hostelResources.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    /* The resource's hostel, copied for filtering */
    hostelId: uuid("hostel_id")
      .notNull()
      .references(() => hostels.id),
    allocationId: uuid("allocation_id").references(() => hostelAllocations.id),
    /* The resource's type when it is a plan (MESS_PLAN, LAUNDRY_PLAN), for the one-plan-per-kind constraint */
    planType: text("plan_type"),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date"),
    status: hostelBookingStatus("status").notNull().default("ACTIVE"),
    /* The assignment this one continues (roll-over, transfer within a hostel) */
    previousAssignmentId: uuid("previous_assignment_id").references(() => hostelResourceAssignments.id),
    endReason: hostelEndReason("end_reason"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedBy: uuid("ended_by").references(() => users.id),
    assignedBy: uuid("assigned_by").references(() => users.id),
    notes: text("notes")
  },
  t => [
    index("hostel_resource_assignments_resource_idx").on(t.resourceId, t.fromDate),
    index("hostel_resource_assignments_student_idx").on(t.studentId, t.fromDate),
    index("hostel_resource_assignments_allocation_idx").on(t.allocationId),
    index("hostel_resource_assignments_tenant_hostel_idx").on(t.tenantId, t.hostelId),
    check("hostel_resource_assignments_dates_chk", sql`${t.toDate} IS NULL OR ${t.toDate} >= ${t.fromDate}`),
    check("hostel_resource_assignments_plan_chk", sql`${t.planType} IS NULL OR ${t.planType} IN (${planList})`),
    check(
      "hostel_resource_assignments_cancelled_chk",
      sql`${t.status} <> 'CANCELLED' OR (${t.endReason} IS NOT NULL AND ${t.endedAt} IS NOT NULL)`
    )
  ]
);

export const hostelResourceAssignmentsRelations = relations(hostelResourceAssignments, ({ one }) => ({
  resource: one(hostelResources, {
    fields: [hostelResourceAssignments.resourceId],
    references: [hostelResources.id]
  }),
  student: one(students, { fields: [hostelResourceAssignments.studentId], references: [students.id] }),
  allocation: one(hostelAllocations, {
    fields: [hostelResourceAssignments.allocationId],
    references: [hostelAllocations.id]
  })
}));
