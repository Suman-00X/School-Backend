import { relations, sql } from "drizzle-orm";
import { boolean, check, date, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { LEAVE_REQUEST_STATUSES } from "../../shared/constants/hr.constants.js";
import { dayCount } from "../../shared/models/money.columns.js";

export const leaveRequestStatus = pgEnum("leave_request_status", LEAVE_REQUEST_STATUSES);

/* Kinds of leave (Casual, Sick, Earned, Leave without pay…) with a yearly quota */
export const leaveTypes = pgTable(
  "leave_types",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    /* Days per calendar year, per employee */
    annualQuotaDays: dayCount("annual_quota_days").notNull(),
    /* Unpaid leave days are loss of pay in payroll */
    isPaid: boolean("is_paid").notNull().default(true),
    /* false = requests are approved on submission */
    requiresApproval: boolean("requires_approval").notNull().default(true),
    description: text("description")
  },
  t => [
    uniqueIndex("leave_types_tenant_code_uq").on(t.tenantId, t.code).where(activeRows(t)),
    uniqueIndex("leave_types_tenant_name_uq").on(t.tenantId, t.name).where(activeRows(t)),
    check("leave_types_quota_chk", sql`${t.annualQuotaDays} >= 0 AND ${t.annualQuotaDays} <= 366`)
  ]
);

/* An employee's request for leave. `days` = working days in the range (0.5 for a half day),
   fixed when the request is made. */
export const leaveRequests = pgTable(
  "leave_requests",
  {
    ...baseColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    halfDay: boolean("half_day").notNull().default(false),
    days: dayCount("days").notNull(),
    reason: text("reason").notNull(),
    status: leaveRequestStatus("status").notNull().default("PENDING"),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason")
  },
  t => [
    index("leave_requests_user_dates_idx").on(t.tenantId, t.userId, t.fromDate),
    index("leave_requests_status_idx").on(t.tenantId, t.status),
    check("leave_requests_dates_chk", sql`${t.toDate} >= ${t.fromDate}`),
    check("leave_requests_days_chk", sql`${t.days} > 0`),
    check("leave_requests_half_day_chk", sql`NOT ${t.halfDay} OR (${t.fromDate} = ${t.toDate} AND ${t.days} = 0.5)`)
  ]
);

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  leaveType: one(leaveTypes, { fields: [leaveRequests.leaveTypeId], references: [leaveTypes.id] }),
  user: one(users, { fields: [leaveRequests.userId], references: [users.id] })
}));
