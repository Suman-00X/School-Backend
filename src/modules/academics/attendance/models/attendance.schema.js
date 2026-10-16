import { relations } from "drizzle-orm";
import { date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { sections } from "../../sections/models/section.schema.js";
import { subjects } from "../../subjects/models/subject.schema.js";
import { ATTENDANCE_STATUSES } from "../../shared/constants/academic.constants.js";

export const attendanceStatus = pgEnum("attendance_status", ATTENDANCE_STATUSES);

/* One register taken for a section on a date. periodNumber 0 = whole-day
   attendance; 1..n = period-wise attendance for a subject. */
export const attendanceSessions = pgTable(
  "attendance_sessions",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    date: date("date").notNull(),
    periodNumber: integer("period_number").notNull().default(0),
    subjectId: uuid("subject_id").references(() => subjects.id),
    takenBy: uuid("taken_by")
      .notNull()
      .references(() => users.id),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
    remarks: text("remarks"),
    /* Set when an override role changed the register after it locked */
    lockOverrideReason: text("lock_override_reason"),
    lockOverriddenBy: uuid("lock_overridden_by").references(() => users.id),
    lockOverriddenAt: timestamp("lock_overridden_at", { withTimezone: true })
  },
  t => [uniqueIndex("attendance_sessions_section_date_period_uq").on(t.sectionId, t.date, t.periodNumber)]
);

/* A student's mark in a register. Section/date/period are copied from the
   session so per-student summaries are a single indexed query. */
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    ...baseColumns(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => attendanceSessions.id),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    date: date("date").notNull(),
    periodNumber: integer("period_number").notNull().default(0),
    status: attendanceStatus("status").notNull(),
    remarks: text("remarks")
  },
  t => [
    uniqueIndex("attendance_records_session_student_uq").on(t.sessionId, t.studentId),
    index("attendance_records_student_date_idx").on(t.studentId, t.date),
    index("attendance_records_section_date_idx").on(t.sectionId, t.date)
  ]
);

export const attendanceSessionsRelations = relations(attendanceSessions, ({ many, one }) => ({
  records: many(attendanceRecords),
  subject: one(subjects, { fields: [attendanceSessions.subjectId], references: [subjects.id] })
}));

export const attendanceRecordsRelations = relations(attendanceRecords, ({ one }) => ({
  session: one(attendanceSessions, { fields: [attendanceRecords.sessionId], references: [attendanceSessions.id] }),
  student: one(students, { fields: [attendanceRecords.studentId], references: [students.id] })
}));
