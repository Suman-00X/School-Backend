import { and, asc, between, count, eq, sql } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { staffAttendance } from "../models/staffAttendance.schema.js";

const excluded = column => sql.raw(`excluded."${column.name}"`);
const target = [staffAttendance.tenantId, staffAttendance.userId, staffAttendance.date];

export const staffAttendanceRepository = {
  ...createRepository({
    table: staffAttendance,
    queryKey: "staffAttendance",
    orderBy: [asc(staffAttendance.date), asc(staffAttendance.userId)]
  }),

  /* Insert or overwrite each (employee, date) mark -> [{ userId, created }] */
  upsertMany: (tenantId, rows, { dbc = db } = {}) =>
    dbc
      .insert(staffAttendance)
      .values(rows.map(row => ({ ...row, tenantId, isActive: true })))
      .onConflictDoUpdate({
        target,
        set: {
          status: excluded(staffAttendance.status),
          checkIn: excluded(staffAttendance.checkIn),
          checkOut: excluded(staffAttendance.checkOut),
          remarks: excluded(staffAttendance.remarks),
          recordedBy: excluded(staffAttendance.recordedBy),
          /* A hand-recorded mark no longer belongs to a leave */
          leaveRequestId: null,
          isActive: true,
          updatedAt: new Date()
        }
      })
      .returning({ userId: staffAttendance.userId, created: sql`(xmax = 0)`.mapWith(Boolean) }),

  /* Insert marks only where the day has none yet -> [{ date }] inserted */
  insertMissing: (tenantId, rows, { dbc = db } = {}) =>
    rows.length
      ? dbc
          .insert(staffAttendance)
          .values(rows.map(row => ({ ...row, tenantId, isActive: true })))
          .onConflictDoNothing({ target })
          .returning({ date: staffAttendance.date })
      : [],

  /* Marks a leave wrote (and nobody has overwritten since) -> [{ date }] removed */
  deleteForLeave: (tenantId, leaveRequestId, { dbc = db } = {}) =>
    dbc
      .delete(staffAttendance)
      .where(and(eq(staffAttendance.tenantId, tenantId), eq(staffAttendance.leaveRequestId, leaveRequestId)))
      .returning({ date: staffAttendance.date }),

  /* -> [{ userId, status, days }] in [from, to] */
  countByUserAndStatus: (tenantId, { userId, from, to }) =>
    db
      .select({ userId: staffAttendance.userId, status: staffAttendance.status, days: count() })
      .from(staffAttendance)
      .where(
        scoped(
          staffAttendance,
          tenantId,
          between(staffAttendance.date, from, to),
          userId ? eq(staffAttendance.userId, userId) : undefined
        )
      )
      .groupBy(staffAttendance.userId, staffAttendance.status)
};
