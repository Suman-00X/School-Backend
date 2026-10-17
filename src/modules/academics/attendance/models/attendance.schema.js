import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { sections } from "../../sections/models/section.schema.js";
import { subjects } from "../../subjects/models/subject.schema.js";
import { ATTENDANCE_KINDS, ATTENDANCE_STATUSES } from "../../shared/constants/academic.constants.js";

export const attendanceStatus = pgEnum("attendance_status", ATTENDANCE_STATUSES);
export const attendanceKind = pgEnum("attendance_kind", ATTENDANCE_KINDS);

/* Only period registers carry a period number (1..n); the others use 0 */
const periodMatchesKind = t => sql`(${t.kind} = 'PERIOD') = (${t.periodNumber} > 0)`;

/* One register taken for a section on a date: the whole day (DAY), a half day
   (FORENOON, AFTERNOON) or one period of the timetable (PERIOD + periodNumber).
   The kind is stored, so a register keeps its meaning when the school changes mode. */
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
    kind: attendanceKind("kind").notNull().default("DAY"),
    periodNumber: integer("period_number").notNull().default(0),
    /* PERIOD: the subject taught, the timetable's unless the teacher said otherwise */
    subjectId: uuid("subject_id").references(() => subjects.id),
    /* Who took (or last retook) the register */
    takenBy: uuid("taken_by")
      .notNull()
      .references(() => users.id),
    /* PERIOD: taken by a teacher who is neither the timetabled nor the subject teacher */
    isSubstitute: boolean("is_substitute").notNull().default(false),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
    remarks: text("remarks"),
    /* Set when an override role changed the register after it locked */
    lockOverrideReason: text("lock_override_reason"),
    lockOverriddenBy: uuid("lock_overridden_by").references(() => users.id),
    lockOverriddenAt: timestamp("lock_overridden_at", { withTimezone: true })
  },
  t => [
    uniqueIndex("attendance_sessions_section_date_kind_period_uq").on(t.sectionId, t.date, t.kind, t.periodNumber),
    check("attendance_sessions_period_kind_chk", periodMatchesKind(t)),
    check("attendance_sessions_substitute_chk", sql`${t.kind} = 'PERIOD' OR NOT ${t.isSubstitute}`)
  ]
);

/* A student's mark in a register. Section/date/kind/period are copied from the
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
    kind: attendanceKind("kind").notNull().default("DAY"),
    periodNumber: integer("period_number").notNull().default(0),
    status: attendanceStatus("status").notNull(),
    remarks: text("remarks")
  },
  t => [
    uniqueIndex("attendance_records_session_student_uq").on(t.sessionId, t.studentId),
    index("attendance_records_student_date_idx").on(t.studentId, t.date),
    index("attendance_records_section_date_idx").on(t.sectionId, t.date),
    check("attendance_records_period_kind_chk", periodMatchesKind(t))
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
