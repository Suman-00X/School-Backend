import { and, asc, between, desc, eq, gte, inArray, lte, sum } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { OPEN_LEAVE_STATUSES } from "../../shared/constants/hr.constants.js";
import { leaveRequests, leaveTypes } from "../models/leave.schema.js";

export const leaveTypeRepository = createRepository({
  table: leaveTypes,
  queryKey: "leaveTypes",
  orderBy: asc(leaveTypes.name)
});

export const leaveRequestRepository = {
  ...createRepository({
    table: leaveRequests,
    queryKey: "leaveRequests",
    orderBy: [desc(leaveRequests.fromDate), desc(leaveRequests.createdAt)]
  }),

  /* Lock a request for the rest of the transaction (decisions, cancellation) */
  lockForUpdate: async (tenantId, requestId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(leaveRequests)
      .where(scoped(leaveRequests, tenantId, eq(leaveRequests.id, requestId)))
      .for("update");
    return row ?? null;
  },

  /* A pending or approved request of the employee overlapping [from, to], or null */
  findOverlap: async (tenantId, userId, from, to, { dbc = db } = {}) => {
    const [row] = await dbc
      .select()
      .from(leaveRequests)
      .where(
        scoped(
          leaveRequests,
          tenantId,
          eq(leaveRequests.userId, userId),
          inArray(leaveRequests.status, OPEN_LEAVE_STATUSES),
          lte(leaveRequests.fromDate, to),
          gte(leaveRequests.toDate, from)
        )
      )
      .orderBy(asc(leaveRequests.fromDate))
      .limit(1);
    return row ?? null;
  },

  /* Days held per leave type and status in a calendar year -> [{ leaveTypeId, status, days }] */
  daysByTypeAndStatus: async (tenantId, userId, year, { dbc = db } = {}) => {
    const rows = await dbc
      .select({ leaveTypeId: leaveRequests.leaveTypeId, status: leaveRequests.status, days: sum(leaveRequests.days) })
      .from(leaveRequests)
      .where(
        scoped(
          leaveRequests,
          tenantId,
          eq(leaveRequests.userId, userId),
          inArray(leaveRequests.status, OPEN_LEAVE_STATUSES),
          between(leaveRequests.fromDate, `${year}-01-01`, `${year}-12-31`)
        )
      )
      .groupBy(leaveRequests.leaveTypeId, leaveRequests.status);
    return rows.map(row => ({ ...row, days: Number(row.days ?? 0) }));
  },

  /* Approved requests overlapping [from, to], with their type */
  findApprovedInRange: (tenantId, from, to, { dbc = db } = {}) =>
    dbc
      .select({ request: leaveRequests, leaveType: leaveTypes })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(
        and(
          scoped(leaveRequests, tenantId, eq(leaveRequests.status, "APPROVED")),
          lte(leaveRequests.fromDate, to),
          gte(leaveRequests.toDate, from)
        )
      )
};
