import { and, eq, inArray, isNull, notInArray, or } from "drizzle-orm";
import { db, transaction } from "../../../../common/database/postgres.js";
import { AppError, conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { addDays, maxDate } from "../../../../common/utils/date.util.js";
import { allocationService } from "../../allocations/index.js";
import { resourceService } from "../../resources/index.js";
import { PLAN_TYPES } from "../../shared/constants/hostel.constants.js";
import { residents } from "../../shared/services/residents.service.js";
import {
  coversDay,
  describeRange,
  earlierEnd,
  guardOverlaps,
  notEnded,
  overlapsRange,
  peakUsage,
  phaseCondition,
  phaseOf
} from "../../shared/utils/dateRange.util.js";
import { fullName, resourceLabel } from "../../shared/utils/hostel.util.js";
import { hostelResourceAssignments as assignments } from "../models/hostelResourceAssignment.schema.js";
import { hostelResourceAssignmentRepository as repository } from "../repositories/hostelResourceAssignment.repository.js";

const studentColumns = {
  columns: { id: true, studentCode: true, admissionNumber: true },
  with: { user: { columns: { firstName: true, lastName: true } } }
};

const resourceColumns = {
  columns: {
    id: true,
    hostelId: true,
    roomId: true,
    name: true,
    resourceType: true,
    customType: true,
    capacity: true,
    monthlyFee: true
  }
};

const withDetails = {
  resource: resourceColumns,
  student: studentColumns,
  allocation: { columns: { id: true, roomId: true, bedNumber: true, fromDate: true, toDate: true, status: true } }
};

const isActive = eq(assignments.status, "ACTIVE");
const today = ctx => tenantToday(ctx.tenantId);
const present = (row, day) => row && { ...row, phase: phaseOf(row, day) };
const appendNote = (existing, note) => (note ? (existing ? `${existing}\n${note}` : note) : undefined);
const ending = (ctx, reason) => ({ endReason: reason, endedAt: new Date(), endedBy: ctx.userId ?? null });
const reopened = { endReason: null, endedAt: null, endedBy: null };
const except = ids => ids.length && notInArray(assignments.id, ids);

/* Why `student` cannot hold `resource` for `range` (null when they can):
   - they already hold it on one of those days (409)
   - they are already on another plan of the same kind (409)
   - it is taken (capacity 1, 409) or full on some day (422) */
const problemWith = async (ctx, { resource, student, range, exceptIds = [] }, { dbc }) => {
  const label = resourceLabel(resource);
  const overlapping = [isActive, overlapsRange(assignments, range.fromDate, range.toDate), except(exceptIds)].filter(
    Boolean
  );

  const own = await repository.findOne(
    ctx.tenantId,
    [eq(assignments.resourceId, resource.id), eq(assignments.studentId, student.id), ...overlapping],
    { dbc }
  );
  if (own) return conflict(`${student.name} already holds ${label} ${describeRange(own)}`);

  if (PLAN_TYPES.includes(resource.resourceType)) {
    const plan = await repository.findOne(
      ctx.tenantId,
      [eq(assignments.studentId, student.id), eq(assignments.planType, resource.resourceType), ...overlapping],
      { dbc, with: { resource: resourceColumns } }
    );
    if (plan) return conflict(`${student.name} is already on ${resourceLabel(plan.resource)} ${describeRange(plan)}`);
  }

  const holders = await repository.findMany(ctx.tenantId, {
    dbc,
    conditions: [eq(assignments.resourceId, resource.id), ...overlapping],
    with: { student: studentColumns }
  });
  const { peak, day } = peakUsage(holders, range.fromDate, range.toDate);
  if (peak < resource.capacity) return null;
  if (resource.capacity === 1) {
    const [holder] = holders;
    return conflict(`${label} is held by ${fullName(holder.student.user)} ${describeRange(holder)}`);
  }
  return unprocessable(`${label} is full on ${day} (${resource.capacity} of ${resource.capacity} places taken)`);
};

/* A tied assignment lies within its bed allocation */
const assertWithinAllocation = (range, allocation) => {
  const endsInside = allocation.toDate === null || (range.toDate !== null && range.toDate <= allocation.toDate);
  if (range.fromDate < allocation.fromDate || !endsInside) {
    throw unprocessable(`The assignment must fall within its bed allocation (${describeRange(allocation)})`);
  }
};

const lockResource = async (ctx, resourceId, { dbc }) => {
  const [resource] = await resourceService.lockForUpdate(ctx, [resourceId], { dbc });
  return resource ?? null;
};

export const resourceAssignmentService = {
  list: async (ctx, { page, limit, resourceId, studentId, allocationId, hostelId, phase, activeOn }) => {
    const day = await today(ctx);
    const result = await repository.list(ctx.tenantId, {
      page,
      limit,
      with: withDetails,
      conditions: [
        resourceId && eq(assignments.resourceId, resourceId),
        studentId && eq(assignments.studentId, studentId),
        allocationId && eq(assignments.allocationId, allocationId),
        hostelId && eq(assignments.hostelId, hostelId),
        phase && phaseCondition(assignments, phase, day),
        activeOn && isActive,
        activeOn && coversDay(assignments, activeOn)
      ].filter(Boolean)
    });
    return { ...result, rows: result.rows.map(row => present(row, day)) };
  },

  getById: async (ctx, assignmentId) => {
    const row = await repository.findById(ctx.tenantId, assignmentId, { with: withDetails });
    if (!row) throw notFound("Resource assignment");
    return present(row, await today(ctx));
  },

  /* Tied to a bed (allocationId): within the allocation's dates, which are also the default,
     and only for a resource of that hostel (and that room, for room resources).
     Standalone: hostel-wide resources only, for a current student, from today by default.
     Locks: allocation, then resource (the order every hostel transaction uses). */
  create: async (ctx, { resourceId, studentId, allocationId, fromDate, toDate, notes }) => {
    const day = await today(ctx);
    const student = await residents.load(ctx, studentId);

    const id = await guardOverlaps(() =>
      transaction(async tx => {
        const allocation = allocationId ? await allocationService.lockForUpdate(ctx, allocationId, { dbc: tx }) : null;
        if (allocationId) {
          if (!allocation) throw unprocessable("allocationId does not refer to an existing allocation");
          if (allocation.studentId !== studentId)
            throw unprocessable(`allocationId is not ${student.name}'s allocation`);
          if (allocation.status === "CANCELLED") throw unprocessable("The allocation is cancelled");
        }
        const resource = await lockResource(ctx, resourceId, { dbc: tx });
        if (!resource) throw unprocessable("resourceId does not refer to an existing resource");
        const label = resourceLabel(resource);
        if (resource.status !== "AVAILABLE") throw unprocessable(`${label} is out of service`);

        let range;
        if (allocation) {
          if (resource.hostelId !== allocation.hostelId)
            throw unprocessable(`${label} is in another hostel than the bed`);
          if (resource.roomId && resource.roomId !== allocation.roomId) {
            throw unprocessable(`${label} is in another room; only residents of that room can have it`);
          }
          range = {
            fromDate: fromDate ?? maxDate(day, allocation.fromDate),
            toDate: toDate === undefined ? allocation.toDate : toDate
          };
          if (range.toDate && range.toDate < range.fromDate) {
            throw unprocessable(`toDate cannot be before fromDate (${range.fromDate})`);
          }
          assertWithinAllocation(range, allocation);
        } else {
          if (resource.roomId) {
            throw unprocessable(`${label} belongs to a room; assign it with the resident's allocationId`);
          }
          await residents.assertCurrent(ctx, student);
          range = { fromDate: fromDate ?? day, toDate: toDate ?? null };
          if (range.toDate && range.toDate < range.fromDate) {
            throw unprocessable(`toDate cannot be before fromDate (${range.fromDate})`);
          }
        }

        const problem = await problemWith(ctx, { resource, student, range }, { dbc: tx });
        if (problem) throw problem;

        const created = await repository.create(
          ctx.tenantId,
          {
            resourceId,
            studentId,
            hostelId: resource.hostelId,
            allocationId: allocation?.id ?? null,
            planType: PLAN_TYPES.includes(resource.resourceType) ? resource.resourceType : null,
            ...range,
            assignedBy: ctx.userId,
            notes
          },
          { dbc: tx }
        );
        return created.id;
      })
    );
    return resourceAssignmentService.getById(ctx, id);
  },

  /* Notes, and extending or shortening; overlaps and capacity are checked again */
  update: async (ctx, assignmentId, { fromDate, toDate, notes }) => {
    const day = await today(ctx);
    const peek = await repository.findById(ctx.tenantId, assignmentId);
    if (!peek) throw notFound("Resource assignment");

    await guardOverlaps(() =>
      transaction(async tx => {
        const allocation = peek.allocationId
          ? await allocationService.lockForUpdate(ctx, peek.allocationId, { dbc: tx })
          : null;
        const resource = await lockResource(ctx, peek.resourceId, { dbc: tx });
        const current = await repository.lockForUpdate(ctx.tenantId, assignmentId, { dbc: tx });
        if (!current) throw notFound("Resource assignment");
        const next = {
          fromDate: fromDate ?? current.fromDate,
          toDate: toDate === undefined ? current.toDate : toDate
        };
        const datesChange = next.fromDate !== current.fromDate || next.toDate !== current.toDate;

        if (datesChange) {
          if (current.status === "CANCELLED") throw conflict("This assignment is cancelled; make a new one instead");
          if (!resource) throw unprocessable("The resource no longer exists");
          if (next.fromDate !== current.fromDate && current.fromDate < day) {
            throw unprocessable(`This assignment started on ${current.fromDate}; its start date can no longer change`);
          }
          if (next.toDate && next.toDate < next.fromDate) {
            throw unprocessable(`toDate cannot be before fromDate (${next.fromDate})`);
          }
          if (allocation) assertWithinAllocation(next, allocation);
          const student = await residents.load(ctx, current.studentId);
          const problem = await problemWith(
            ctx,
            { resource, student, range: next, exceptIds: [current.id] },
            { dbc: tx }
          );
          if (problem) throw problem;
        }
        await repository.update(
          ctx.tenantId,
          assignmentId,
          { ...next, ...(datesChange && reopened), ...(notes !== undefined && { notes }) },
          { dbc: tx }
        );
      })
    );
    return resourceAssignmentService.getById(ctx, assignmentId);
  },

  /* The student hands it back on releasedOn (default today; a later date plans it) */
  release: async (ctx, assignmentId, { releasedOn, notes }) => {
    const day = await today(ctx);
    const leavesOn = releasedOn ?? day;
    await transaction(async tx => {
      const current = await repository.lockForUpdate(ctx.tenantId, assignmentId, { dbc: tx });
      if (!current) throw notFound("Resource assignment");
      if (current.status === "CANCELLED") throw conflict("This assignment was cancelled; there is nothing to release");
      if (current.endReason) throw conflict(`This assignment already ended on ${current.toDate}`);
      if (current.fromDate > day) {
        throw unprocessable(`This assignment starts on ${current.fromDate}; cancel it instead of releasing`);
      }
      if (leavesOn < current.fromDate) {
        throw unprocessable(`releasedOn cannot be before the assignment's start (${current.fromDate})`);
      }
      if (current.toDate && leavesOn > current.toDate) {
        throw unprocessable(`releasedOn cannot be after the assignment's end (${current.toDate}); extend it first`);
      }
      await repository.update(
        ctx.tenantId,
        assignmentId,
        { toDate: leavesOn, ...ending(ctx, "RELEASED"), notes: appendNote(current.notes, notes) },
        { dbc: tx }
      );
    });
    return resourceAssignmentService.getById(ctx, assignmentId);
  },

  cancel: async (ctx, assignmentId, { reason }) => {
    const day = await today(ctx);
    await transaction(async tx => {
      const current = await repository.lockForUpdate(ctx.tenantId, assignmentId, { dbc: tx });
      if (!current) throw notFound("Resource assignment");
      if (current.status === "CANCELLED") throw conflict("This assignment is already cancelled");
      if (current.fromDate < day) {
        throw unprocessable(`This assignment started on ${current.fromDate}; release it instead of cancelling`);
      }
      await repository.update(
        ctx.tenantId,
        assignmentId,
        { status: "CANCELLED", ...ending(ctx, "CANCELLED"), notes: appendNote(current.notes, reason) },
        { dbc: tx }
      );
    });
    return resourceAssignmentService.getById(ctx, assignmentId);
  },

  /* For other submodules (inside the caller's transaction, which holds the allocation lock) */

  /* Resources tied to a bed follow its new dates: those that started or ended with the bed move
     with it, the others are clipped to it, and any left with no days are cancelled. Growing
     ones are checked against overlaps and capacity again. -> [{ assignment, resource, change }] */
  followAllocation: async (ctx, before, after, { dbc, reason = "BED_ENDED" }) => {
    const tied = await repository.findMany(ctx.tenantId, {
      dbc,
      conditions: [eq(assignments.allocationId, before.id), isActive]
    });
    if (!tied.length) return [];
    const locked = await resourceService.lockForUpdate(
      ctx,
      tied.map(row => row.resourceId),
      { dbc }
    );
    const resources = new Map(locked.map(resource => [resource.id, resource]));
    const changes = [];

    for (const row of tied) {
      const resource = resources.get(row.resourceId);
      const fromDate = row.fromDate === before.fromDate ? after.fromDate : maxDate(row.fromDate, after.fromDate);
      const toDate = row.toDate === before.toDate ? after.toDate : earlierEnd(row.toDate, after.toDate);

      if (after.status === "CANCELLED" || (toDate !== null && toDate < fromDate)) {
        await repository.update(ctx.tenantId, row.id, { status: "CANCELLED", ...ending(ctx, reason) }, { dbc });
        changes.push({ assignment: row, resource, change: "CANCELLED" });
        continue;
      }
      if (fromDate === row.fromDate && toDate === row.toDate) continue;

      const grows = fromDate < row.fromDate || (row.toDate !== null && (toDate === null || toDate > row.toDate));
      const shortens = toDate !== null && (row.toDate === null || toDate < row.toDate);
      if (grows && resource) {
        const student = await residents.load(ctx, row.studentId);
        const problem = await problemWith(
          ctx,
          { resource, student, range: { fromDate, toDate }, exceptIds: [row.id] },
          { dbc }
        );
        if (problem) {
          throw new AppError(
            problem.status,
            problem.code,
            `${problem.message}, so it cannot follow the bed's new dates; shorten or release it first`
          );
        }
      }
      await repository.update(
        ctx.tenantId,
        row.id,
        { fromDate, toDate, ...(shortens ? ending(ctx, reason) : grows ? reopened : {}) },
        { dbc }
      );
      changes.push({ assignment: { ...row, fromDate, toDate }, resource, change: shortens ? "ENDED" : "CHANGED" });
    }
    return changes;
  },

  /* A transfer: hostel-wide resources of the new bed's hostel continue on the new allocation from
     the move (split when they started earlier); everything else ends with the old bed */
  moveWithAllocation: async (ctx, before, ended, created, { dbc }) => {
    const tied = await repository.findMany(ctx.tenantId, {
      dbc,
      conditions: [eq(assignments.allocationId, before.id), isActive],
      with: { resource: resourceColumns }
    });
    const movesOn = created.fromDate;
    for (const row of tied) {
      const continues =
        row.resource.roomId === null &&
        row.resource.hostelId === created.hostelId &&
        (row.toDate === null || row.toDate >= movesOn);
      if (!continues) continue;
      if (row.fromDate >= movesOn) {
        await repository.update(ctx.tenantId, row.id, { allocationId: created.id }, { dbc });
        continue;
      }
      await repository.update(
        ctx.tenantId,
        row.id,
        { toDate: addDays(movesOn, -1), ...ending(ctx, "TRANSFERRED") },
        { dbc }
      );
      await repository.create(
        ctx.tenantId,
        {
          resourceId: row.resourceId,
          studentId: row.studentId,
          hostelId: row.hostelId,
          allocationId: created.id,
          planType: row.planType,
          fromDate: movesOn,
          toDate: row.toDate,
          previousAssignmentId: row.id,
          assignedBy: ctx.userId,
          notes: row.notes
        },
        { dbc }
      );
    }
    return resourceAssignmentService.followAllocation(ctx, before, ended, { dbc });
  },

  /* A leaver: every current assignment ends on `day`, every upcoming one is cancelled
     -> [{ assignment, resource, change }] */
  endForStudent: async (ctx, studentId, day, { dbc, reason }) => {
    const rows = await repository.lockManyForUpdate(
      ctx.tenantId,
      [eq(assignments.studentId, studentId), notEnded(assignments, day)],
      { dbc }
    );
    const changes = [];
    for (const row of rows) {
      if (row.fromDate > day) {
        await repository.update(ctx.tenantId, row.id, { status: "CANCELLED", ...ending(ctx, reason) }, { dbc });
        changes.push({ assignment: row, change: "CANCELLED" });
      } else if (row.toDate === null || row.toDate > day) {
        await repository.update(ctx.tenantId, row.id, { toDate: day, ...ending(ctx, reason) }, { dbc });
        changes.push({ assignment: { ...row, toDate: day }, change: "ENDED" });
      }
    }
    const resources = await resourceService.findManyByIds(
      ctx,
      changes.map(change => change.assignment.resourceId),
      { dbc }
    );
    return changes.map(change => ({ ...change, resource: resources.find(r => r.id === change.assignment.resourceId) }));
  },

  /* Year-end roll-over of one resident: their assignments (tied to the old bed, or standalone)
     that run to the old year's end continue for `range`, tied to the new bed when they were
     tied before. Problems skip one resource, not the resident. -> { continued, skipped } */
  continueForRollover: async (ctx, { student, previous, next, lastDay, range }, { dbc }) => {
    const rows = await repository.findMany(ctx.tenantId, {
      dbc,
      conditions: [
        eq(assignments.studentId, student.id),
        isActive,
        coversDay(assignments, lastDay),
        or(eq(assignments.allocationId, previous.id), isNull(assignments.allocationId))
      ]
    });
    const locked = await resourceService.lockForUpdate(
      ctx,
      rows.map(row => row.resourceId),
      { dbc }
    );
    const resources = new Map(locked.map(resource => [resource.id, resource]));
    const continued = [];
    const skipped = [];

    for (const row of rows) {
      const resource = resources.get(row.resourceId);
      const entry = { assignmentId: row.id, resource: resource && { id: resource.id, name: resourceLabel(resource) } };
      if (row.toDate === null) {
        skipped.push({ ...entry, reason: "It has no end date, so it already continues" });
        continue;
      }
      if (!resource) {
        skipped.push({ ...entry, reason: "The resource no longer exists" });
        continue;
      }
      if (resource.status !== "AVAILABLE") {
        skipped.push({ ...entry, reason: `${resourceLabel(resource)} is out of service` });
        continue;
      }
      const problem = await problemWith(ctx, { resource, student, range }, { dbc });
      if (problem) {
        skipped.push({ ...entry, reason: problem.message });
        continue;
      }
      const created = await repository.create(
        ctx.tenantId,
        {
          resourceId: resource.id,
          studentId: student.id,
          hostelId: resource.hostelId,
          allocationId: row.allocationId ? next.id : null,
          planType: row.planType,
          ...range,
          previousAssignmentId: row.id,
          assignedBy: ctx.userId,
          notes: row.notes
        },
        { dbc }
      );
      continued.push({ ...entry, newAssignmentId: created.id });
    }
    return { continued, skipped };
  },

  /* Holders per resource on one day -> Map(resourceId -> count) */
  holdersOn: async (ctx, resourceIds, day) => {
    const counts = new Map();
    if (!resourceIds.length) return counts;
    const rows = await repository.findMany(ctx.tenantId, {
      conditions: [inArray(assignments.resourceId, resourceIds), isActive, coversDay(assignments, day)]
    });
    for (const row of rows) counts.set(row.resourceId, (counts.get(row.resourceId) ?? 0) + 1);
    return counts;
  },

  /* The most holders of a resource on any day from `day` on */
  peakFrom: async (ctx, resourceId, day, { dbc = db } = {}) => {
    const rows = await repository.findMany(ctx.tenantId, {
      dbc,
      conditions: [eq(assignments.resourceId, resourceId), isActive, overlapsRange(assignments, day, null)]
    });
    return peakUsage(rows, day, null);
  },

  /* Current and upcoming assignments of these resources */
  notEndedFor: async (ctx, { resourceIds }, { dbc = db } = {}) =>
    resourceIds.length
      ? repository.findMany(ctx.tenantId, {
          dbc,
          conditions: [inArray(assignments.resourceId, resourceIds), notEnded(assignments, await today(ctx))]
        })
      : [],

  /* Current and upcoming resources of these students (self-service) */
  notEndedForStudents: async (ctx, studentIds) => {
    if (!studentIds.length) return [];
    const day = await today(ctx);
    const rows = await repository.findMany(ctx.tenantId, {
      conditions: [and(inArray(assignments.studentId, studentIds), notEnded(assignments, day))],
      orderBy: [assignments.fromDate, assignments.createdAt],
      with: { resource: resourceColumns }
    });
    return rows.map(row => present(row, day));
  }
};
