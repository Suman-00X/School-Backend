import { relations, sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, text, time, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { leaveRequests } from "../../leaves/models/leave.schema.js";
import { STAFF_ATTENDANCE_STATUSES } from "../../shared/constants/hr.constants.js";

export const staffAttendanceStatus = pgEnum("staff_attendance_status", STAFF_ATTENDANCE_STATUSES);

/* One mark per employee per day. Marks written by an approved leave carry its
   leaveRequestId (removed again if the leave is cancelled); recording the day
   by hand clears it. */
export const staffAttendance = pgTable(
  "staff_attendance",
  {
    ...baseColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    date: date("date").notNull(),
    status: staffAttendanceStatus("status").notNull(),
    checkIn: time("check_in"),
    checkOut: time("check_out"),
    remarks: text("remarks"),
    recordedBy: uuid("recorded_by").references(() => users.id),
    leaveRequestId: uuid("leave_request_id").references(() => leaveRequests.id)
  },
  t => [
    /* Also the upsert target of recording */
    uniqueIndex("staff_attendance_user_date_uq").on(t.tenantId, t.userId, t.date),
    index("staff_attendance_date_idx").on(t.tenantId, t.date),
    check(
      "staff_attendance_times_chk",
      sql`${t.checkIn} IS NULL OR ${t.checkOut} IS NULL OR ${t.checkOut} >= ${t.checkIn}`
    )
  ]
);

export const staffAttendanceRelations = relations(staffAttendance, ({ one }) => ({
  user: one(users, { fields: [staffAttendance.userId], references: [users.id] })
}));
