import { relations, sql } from "drizzle-orm";
import { check, date, index, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { sections } from "../../sections/models/section.schema.js";
import { STUDENT_LEAVE_SESSIONS, STUDENT_LEAVE_STATUSES } from "../constants/studentLeave.constants.js";

export const studentLeaveStatus = pgEnum("student_leave_status", STUDENT_LEAVE_STATUSES);
export const studentLeaveSession = pgEnum("student_leave_session", STUDENT_LEAVE_SESSIONS);

/* A parent asks for their child's leave; the class teacher (or deputy, principal, admin)
   approves or rejects it. Approval turns the child's ABSENT marks on those days into
   EXCUSED, and the register shows the leave when it is taken. `days` = school days in the
   range (0.5 for a half day), fixed when applying. */
export const studentLeaveRequests = pgTable(
  "student_leave_requests",
  {
    ...baseColumns(),
    /* The year the days fall in (archived years are read-only) */
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    /* The student's section when applying: decides who approves it */
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    session: studentLeaveSession("session").notNull().default("FULL_DAY"),
    days: numeric("days", { precision: 4, scale: 1, mode: "number" }).notNull(),
    reasonCategory: text("reason_category").notNull(),
    reason: text("reason").notNull(),
    status: studentLeaveStatus("status").notNull().default("PENDING"),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason")
  },
  t => [
    index("student_leave_requests_student_idx").on(t.tenantId, t.studentId, t.fromDate),
    index("student_leave_requests_section_idx").on(t.tenantId, t.sectionId, t.status, t.fromDate),
    check("student_leave_requests_dates_chk", sql`${t.toDate} >= ${t.fromDate}`),
    check("student_leave_requests_days_chk", sql`${t.days} > 0`),
    check(
      "student_leave_requests_half_day_chk",
      sql`${t.session} = 'FULL_DAY' OR (${t.fromDate} = ${t.toDate} AND ${t.days} = 0.5)`
    )
  ]
);

export const studentLeaveRequestsRelations = relations(studentLeaveRequests, ({ one }) => ({
  student: one(students, { fields: [studentLeaveRequests.studentId], references: [students.id] }),
  section: one(sections, { fields: [studentLeaveRequests.sectionId], references: [sections.id] }),
  requester: one(users, {
    fields: [studentLeaveRequests.requestedBy],
    references: [users.id],
    relationName: "studentLeaveRequester"
  }),
  decider: one(users, {
    fields: [studentLeaveRequests.decidedBy],
    references: [users.id],
    relationName: "studentLeaveDecider"
  }),
  canceller: one(users, {
    fields: [studentLeaveRequests.cancelledBy],
    references: [users.id],
    relationName: "studentLeaveCanceller"
  })
}));
