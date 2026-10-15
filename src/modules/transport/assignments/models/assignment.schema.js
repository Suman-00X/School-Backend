import { relations, sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { academicYears } from "../../../academics/academic-years/models/academicYear.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { transportRouteStops, transportRoutes } from "../../routes/models/route.schema.js";
import { ASSIGNMENT_DIRECTIONS, ASSIGNMENT_STATUSES } from "../../shared/constants/transport.constants.js";

export const transportDirection = pgEnum("transport_direction", ASSIGNMENT_DIRECTIONS);
export const transportAssignmentStatus = pgEnum("transport_assignment_status", ASSIGNMENT_STATUSES);

/* A student rides a route from a stop in one academic year. Ending keeps the row (ENDED);
   a change ends the current row and adds a new one pointing back at it. */
export const transportAssignments = pgTable(
  "transport_assignments",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    routeId: uuid("route_id")
      .notNull()
      .references(() => transportRoutes.id),
    stopId: uuid("stop_id")
      .notNull()
      .references(() => transportRouteStops.id),
    direction: transportDirection("direction").notNull().default("BOTH"),
    startDate: date("start_date").notNull(),
    /* null = ongoing */
    endDate: date("end_date"),
    status: transportAssignmentStatus("status").notNull().default("ACTIVE"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /* The assignment this one replaced (route/stop change) */
    previousAssignmentId: uuid("previous_assignment_id"),
    notes: text("notes")
  },
  t => [
    /* One active assignment per student per year */
    uniqueIndex("transport_assignments_year_student_active_uq")
      .on(t.academicYearId, t.studentId)
      .where(sql`${t.isActive} = true AND ${t.status} = 'ACTIVE'`),
    index("transport_assignments_route_idx").on(t.routeId, t.academicYearId, t.status),
    index("transport_assignments_stop_idx").on(t.stopId, t.status),
    index("transport_assignments_student_idx").on(t.studentId),
    check("transport_assignments_dates_chk", sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`),
    check(
      "transport_assignments_ended_chk",
      sql`(${t.status} = 'ACTIVE' AND ${t.endedAt} IS NULL) OR (${t.status} = 'ENDED' AND ${t.endDate} IS NOT NULL)`
    )
  ]
);

export const transportAssignmentsRelations = relations(transportAssignments, ({ one }) => ({
  student: one(students, { fields: [transportAssignments.studentId], references: [students.id] }),
  route: one(transportRoutes, { fields: [transportAssignments.routeId], references: [transportRoutes.id] }),
  stop: one(transportRouteStops, { fields: [transportAssignments.stopId], references: [transportRouteStops.id] }),
  academicYear: one(academicYears, { fields: [transportAssignments.academicYearId], references: [academicYears.id] })
}));
