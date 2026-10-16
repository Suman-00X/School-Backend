import { eq, gte, lte } from "drizzle-orm";
import { hasPermission } from "../../../../common/auth/grants.js";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, forbidden, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { eachDay } from "../../../../common/utils/date.util.js";
import { staffAttendanceService } from "../../staff-attendance/index.js";
import { employeeDirectory } from "../../shared/services/employeeDirectory.service.js";
import { payrollLock } from "../../shared/services/payrollLock.service.js";
import { workCalendar } from "../../shared/services/workCalendar.service.js";
import { lockKey } from "../../shared/utils/locks.util.js";
import { leaveRequests } from "../models/leave.schema.js";
import { LEAVE_REQUEST_PERMISSIONS } from "../permissions/leave.permissions.js";
import { leaveRequestRepository } from "../repositories/leave.repository.js";
import { leaveTypeService } from "./leaveType.service.js";

const withDetails = {
  leaveType: { columns: { id: true, name: true, code: true, isPaid: true } },
  user: { columns: { id: true, firstName: true, lastName: true, role: true } }
};

const dayWord = days => `${days} day${days === 1 ? "" : "s"}`;

/* Working days a request takes (weekly offs and holidays excluded inside an
   academic year; calendar days outside one) -> { dates, days } */
const countDays = async (ctx, { fromDate, toDate, halfDay }) => {
  const { days: dates } = await workCalendar.workingDays(ctx, fromDate, toDate);
  return { dates, days: halfDay ? (dates.length ? 0.5 : 0) : dates.length };
};

/* Per type: quota, used (approved), pending, remaining in a calendar year */
const balancesFor = async (ctx, userId, year, { dbc } = {}) => {
  const [types, rows] = await Promise.all([
    leaveTypeService.findAll(ctx),
    leaveRequestRepository.daysByTypeAndStatus(ctx.tenantId, userId, year, { dbc })
  ]);
  const held = (typeId, status) => rows.find(r => r.leaveTypeId === typeId && r.status === status)?.days ?? 0;
  return types.map(type => {
    const used = held(type.id, "APPROVED");
    const pending = held(type.id, "PENDING");
    return {
      leaveTypeId: type.id,
      code: type.code,
      name: type.name,
      isPaid: type.isPaid,
      quota: type.annualQuotaDays,
      used,
      pending,
      remaining: Math.max(type.annualQuotaDays - used - pending, 0)
    };
  });
};

/* Approving marks each counted day without a mark: LEAVE, or HALF_DAY for a half-day leave */
const markApproved = async (ctx, request, leaveType, { dbc }) => {
  const { dates } = await countDays(ctx, request);
  await payrollLock.assertOpen(ctx, dates, { dbc });
  return staffAttendanceService.fillFromLeave(
    ctx,
    {
      userId: request.userId,
      dates,
      status: request.halfDay ? "HALF_DAY" : "LEAVE",
      remarks: `${leaveType.name}${request.halfDay ? " (half day)" : ""}`,
      leaveRequestId: request.id
    },
    { dbc }
  );
};

const listConditions = ({ status, userId, leaveTypeId, from, to }) =>
  [
    status && eq(leaveRequests.status, status),
    userId && eq(leaveRequests.userId, userId),
    leaveTypeId && eq(leaveRequests.leaveTypeId, leaveTypeId),
    from && gte(leaveRequests.toDate, from),
    to && lte(leaveRequests.fromDate, to)
  ].filter(Boolean);

export const leaveRequestService = {
  /* An employee applies for themselves. Leave types that need no approval are approved at once. */
  apply: async (ctx, { leaveTypeId, fromDate, toDate, halfDay, reason }) => {
    const leaveType = await leaveTypeService.findById(ctx, leaveTypeId);
    if (!leaveType) throw unprocessable("leaveTypeId does not refer to an existing leave type");
    if (!(await employeeDirectory.find(ctx, ctx.userId))) {
      throw unprocessable("Only active employees can apply for leave");
    }

    const { dates, days } = await countDays(ctx, { fromDate, toDate, halfDay });
    if (!days) {
      throw unprocessable(
        `There are no working days between ${fromDate} and ${toDate} (weekly offs and holidays are not counted)`
      );
    }
    await payrollLock.assertOpen(ctx, dates);
    const year = Number(fromDate.slice(0, 4));

    const requestId = await transaction(async tx => {
      /* One employee's applications are serialized: overlap and quota checks stay true until commit */
      await lockKey(tx, "hr.leave", ctx.tenantId, ctx.userId);

      const overlap = await leaveRequestRepository.findOverlap(ctx.tenantId, ctx.userId, fromDate, toDate, {
        dbc: tx
      });
      if (overlap) {
        throw conflict(
          `You already have a ${overlap.status.toLowerCase()} leave request from ${overlap.fromDate} to ${overlap.toDate} that overlaps these dates`
        );
      }

      const balance = (await balancesFor(ctx, ctx.userId, year, { dbc: tx })).find(b => b.leaveTypeId === leaveTypeId);
      if (balance.used + balance.pending + days > balance.quota) {
        throw unprocessable(
          `Not enough ${leaveType.name} balance for ${year}: requested ${dayWord(days)}, remaining ${dayWord(balance.remaining)} (quota ${balance.quota}, used ${balance.used}, pending ${balance.pending})`
        );
      }

      const autoApproved = !leaveType.requiresApproval;
      const request = await leaveRequestRepository.create(
        ctx.tenantId,
        {
          userId: ctx.userId,
          leaveTypeId,
          fromDate,
          toDate,
          halfDay,
          days,
          reason,
          status: autoApproved ? "APPROVED" : "PENDING",
          decidedAt: autoApproved ? new Date() : undefined,
          decisionNote: autoApproved ? "Approved automatically: this leave type needs no approval" : undefined
        },
        { dbc: tx }
      );
      if (autoApproved) await markApproved(ctx, request, leaveType, { dbc: tx });
      return request.id;
    });

    return leaveRequestService.getById(ctx, requestId);
  },

  /* ADMIN / PRINCIPAL approve or reject a pending request (never their own) */
  decide: async (ctx, requestId, { decision, note }) => {
    const markedDates = await transaction(async tx => {
      const request = await leaveRequestRepository.lockForUpdate(ctx.tenantId, requestId, { dbc: tx });
      if (!request) throw notFound("Leave request");
      if (request.userId === ctx.userId) throw unprocessable("You cannot decide on your own leave request");
      if (request.status !== "PENDING") {
        throw conflict(`This leave request is already ${request.status.toLowerCase()}`);
      }

      let marked = [];
      if (decision === "APPROVED") {
        const leaveType = await leaveTypeService.findById(ctx, request.leaveTypeId, { dbc: tx });
        marked = await markApproved(ctx, request, leaveType ?? { name: "Leave" }, { dbc: tx });
      }
      await leaveRequestRepository.update(
        ctx.tenantId,
        requestId,
        { status: decision, decidedBy: ctx.userId, decidedAt: new Date(), decisionNote: note ?? null },
        { dbc: tx }
      );
      return marked;
    });
    return { ...(await leaveRequestService.getById(ctx, requestId)), markedDates };
  },

  /* The applicant cancels while PENDING; HR's administrators (cancelAny) can also cancel
     anyone's request, approved leave included (its LEAVE marks are removed). */
  cancel: async (ctx, requestId, { reason } = {}) => {
    const [mayCancelAny, mayReadAll] = await Promise.all([
      hasPermission(ctx, LEAVE_REQUEST_PERMISSIONS.cancelAny),
      hasPermission(ctx, LEAVE_REQUEST_PERMISSIONS.read)
    ]);
    const clearedDates = await transaction(async tx => {
      const request = await leaveRequestRepository.lockForUpdate(ctx.tenantId, requestId, { dbc: tx });
      const isApplicant = request?.userId === ctx.userId;
      if (!isApplicant && !mayCancelAny) {
        /* Other employees must not learn the request exists; those who can list it are told why */
        if (!request || !mayReadAll) throw notFound("Leave request");
        throw forbidden("Only the applicant or an HR administrator can cancel a leave request");
      }
      if (!request) throw notFound("Leave request");
      if (!["PENDING", "APPROVED"].includes(request.status)) {
        throw conflict(`This leave request is already ${request.status.toLowerCase()}`);
      }
      if (request.status === "APPROVED" && !mayCancelAny) {
        throw conflict("Approved leave can only be cancelled by an HR administrator");
      }

      let cleared = [];
      if (request.status === "APPROVED") {
        await payrollLock.assertOpen(ctx, eachDay(request.fromDate, request.toDate), { dbc: tx });
        cleared = await staffAttendanceService.clearFromLeave(ctx, requestId, { dbc: tx });
      }
      await leaveRequestRepository.update(
        ctx.tenantId,
        requestId,
        { status: "CANCELLED", cancelledBy: ctx.userId, cancelledAt: new Date(), cancelReason: reason ?? null },
        { dbc: tx }
      );
      return cleared;
    });
    return { ...(await leaveRequestService.getById(ctx, requestId)), clearedDates };
  },

  list: (ctx, { page, limit, ...filters }) =>
    leaveRequestRepository.list(ctx.tenantId, { page, limit, with: withDetails, conditions: listConditions(filters) }),

  /* The signed-in employee's own requests */
  mine: (ctx, { page, limit, ...filters }) =>
    leaveRequestRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withDetails,
      conditions: listConditions({ ...filters, userId: ctx.userId })
    }),

  getById: async (ctx, requestId) => {
    const request = await leaveRequestRepository.findById(ctx.tenantId, requestId, { with: withDetails });
    if (!request) throw notFound("Leave request");
    return request;
  },

  /* Balances of one employee (managers) or of the signed-in employee */
  balances: async (ctx, { userId = ctx.userId, year }) => {
    if (!(await employeeDirectory.find(ctx, userId))) throw notFound("Employee");
    const forYear = year ?? Number((await tenantToday(ctx.tenantId)).slice(0, 4));
    return { userId, year: forYear, balances: await balancesFor(ctx, userId, forYear) };
  },

  /* For other submodules: approved leave overlapping [from, to] -> [{ request, leaveType }] */
  approvedInRange: (ctx, from, to, { dbc } = {}) =>
    leaveRequestRepository.findApprovedInRange(ctx.tenantId, from, to, { dbc })
};
