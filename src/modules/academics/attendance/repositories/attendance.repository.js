import { and, between, count, eq, sql } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { attendanceRecords, attendanceSessions } from "../models/attendance.schema.js";

const excluded = column => sql.raw(`excluded."${column.name}"`);

export const attendanceSessionRepository = {
  ...createRepository({ table: attendanceSessions, queryKey: "attendanceSessions" }),

  /* Create or refresh the register for (section, date, period). -> { id, created } */
  upsert: async (tenantId, values, { dbc = db } = {}) => {
    const [row] = await dbc
      .insert(attendanceSessions)
      .values({ ...values, tenantId, isActive: true })
      .onConflictDoUpdate({
        target: [attendanceSessions.sectionId, attendanceSessions.date, attendanceSessions.periodNumber],
        set: {
          subjectId: excluded(attendanceSessions.subjectId),
          takenBy: excluded(attendanceSessions.takenBy),
          takenAt: new Date(),
          remarks: excluded(attendanceSessions.remarks),
          isActive: true,
          updatedAt: new Date()
        }
      })
      .returning({ id: attendanceSessions.id, created: sql`(xmax = 0)`.mapWith(Boolean) });
    return row;
  }
};

export const attendanceRecordRepository = {
  ...createRepository({ table: attendanceRecords, queryKey: "attendanceRecords" }),

  upsertMany: (tenantId, rows, { dbc = db } = {}) =>
    dbc
      .insert(attendanceRecords)
      .values(rows.map(row => ({ ...row, tenantId, isActive: true })))
      .onConflictDoUpdate({
        target: [attendanceRecords.sessionId, attendanceRecords.studentId],
        set: {
          status: excluded(attendanceRecords.status),
          remarks: excluded(attendanceRecords.remarks),
          isActive: true,
          updatedAt: new Date()
        }
      }),

  /* Whole-day marks per student and status in a date range:
     -> [{ studentId, status, days }] */
  countByStudentAndStatus: (tenantId, { sectionId, studentId, from, to }) =>
    db
      .select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status, days: count() })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.tenantId, tenantId),
          eq(attendanceRecords.isActive, true),
          eq(attendanceRecords.periodNumber, 0),
          sectionId ? eq(attendanceRecords.sectionId, sectionId) : undefined,
          studentId ? eq(attendanceRecords.studentId, studentId) : undefined,
          between(attendanceRecords.date, from, to)
        )
      )
      .groupBy(attendanceRecords.studentId, attendanceRecords.status)
};
