import { eq, inArray, notInArray } from "drizzle-orm";
import { db, transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { addDays } from "../../../../common/utils/date.util.js";
import { hostelService } from "../../hostels/index.js";
import { resourceAssignmentService } from "../../resource-assignments/index.js";
import { roomService } from "../../rooms/index.js";
import { residents } from "../../shared/services/residents.service.js";
import {
  coversDay,
  describeRange,
  guardOverlaps,
  notEnded,
  overlapsRange,
  phaseCondition,
  phaseOf
} from "../../shared/utils/dateRange.util.js";
import { freeBeds, fullName, genderMismatch, roomLabel } from "../../shared/utils/hostel.util.js";
import { hostelAllocations as allocations } from "../models/hostelAllocation.schema.js";
import { hostelAllocationRepository } from "../repositories/hostelAllocation.repository.js";

const studentColumns = {
  columns: { id: true, userId: true, studentCode: true, admissionNumber: true },
  with: { user: { columns: { firstName: true, lastName: true } } }
};

const withDetails = {
  student: studentColumns,
  hostel: { columns: { id: true, name: true, code: true, residentGender: true } },
  room: { columns: { id: true, roomNumber: true, floor: true, roomType: true, monthlyFee: true, status: true } }
};

const isActive = eq(allocations.status, "ACTIVE");

/* What ended an allocation, for messages */
const ENDED_BY = {
  VACATED: on => `was already vacated on ${on}`,
  TRANSFERRED: on => `already ended on ${on} with a transfer`,
  LEFT_SCHOOL: on => `already ended on ${on} when the student left the school`
};

const today = ctx => tenantToday(ctx.tenantId);

/* Adds the derived phase (UPCOMING, CURRENT, ENDED, CANCELLED) */
const present = (row, day) => row && { ...row, phase: phaseOf(row, day) };

const appendNote = (existing, note) => (note ? (existing ? `${existing}\n${note}` : note) : undefined);

const ending = (ctx, reason) => ({ endReason: reason, endedAt: new Date(), endedBy: ctx.userId ?? null });

/* Lock the rooms, then return each with its active hostel */
const lockRooms = async (ctx, roomIds, { dbc }) => {
  const rows = await roomService.lockForUpdate(ctx, [...new Set(roomIds)], { dbc });
  const rooms = new Map();
  for (const room of rows) {
    const hostel = await hostelService.findById(ctx, room.hostelId, { dbc });
    if (hostel) rooms.set(room.id, { room, hostel });
  }
  return rooms;
};

/* A student holds one bed per day: refuse a range that meets another of their allocations */
const assertStudentFree = async (ctx, student, range, { dbc, exceptIds = [] }) => {
  const other = await hostelAllocationRepository.findOne(
    ctx.tenantId,
    [
      eq(allocations.studentId, student.id),
      isActive,
      overlapsRange(allocations, range.fromDate, range.toDate),
      exceptIds.length && notInArray(allocations.id, exceptIds)
    ].filter(Boolean),
    { dbc, with: { room: { columns: { roomNumber: true } }, hostel: { columns: { name: true } } } }
  );
  if (other) {
    throw conflict(
      `${student.name} already has bed ${other.bedNumber} in ${roomLabel(other.room, other.hostel)} ${describeRange(other)}; ` +
        "shorten, cancel or transfer that allocation first"
    );
  }
};

/* The bed a student gets in a locked room for `range`: the requested one, or the lowest bed
   free for the whole range. `continuing`: an existing resident (date change, roll-over), so the
   room's status and the gender rule were already met. */
const pickBed = async (ctx, { room, hostel, student, bedNumber, range, continuing, exceptIds = [] }, { dbc }) => {
  const label = roomLabel(room, hostel);
  if (!continuing) {
    if (room.status !== "AVAILABLE") {
      throw unprocessable(
        `${label} is ${room.status === "CLOSED" ? "closed" : "under maintenance"} and cannot take residents`
      );
    }
    const mismatch = genderMismatch(hostel, student.account);
    if (mismatch) throw unprocessable(mismatch);
  }
  const bookings = await allocationService.bookedBeds(ctx, [room.id], range, { dbc, exceptIds });

  if (bedNumber !== undefined) {
    if (bedNumber > room.capacity) {
      throw unprocessable(`${label} has beds 1 to ${room.capacity}; bed ${bedNumber} does not exist`);
    }
    const holder = bookings.find(booking => booking.bedNumber === bedNumber);
    if (holder) {
      throw conflict(
        `Bed ${bedNumber} in ${label} is booked by ${fullName(holder.student.user)} ${describeRange(holder)}`
      );
    }
    return bedNumber;
  }
  const [lowest] = freeBeds(
    room.capacity,
    bookings.map(booking => booking.bedNumber)
  );
  if (!lowest) throw unprocessable(`${label} has no bed free for the whole stay ${describeRange(range)}`);
  return lowest;
};

export const allocationService = {
  /* Filters: phase (as of today), activeOn (one day), fromDate/toDate (overlapping a range) */
  list: async (ctx, { page, limit, hostelId, roomId, studentId, phase, activeOn, fromDate, toDate }) => {
    const day = await today(ctx);
    const result = await hostelAllocationRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withDetails,
      conditions: [
        hostelId && eq(allocations.hostelId, hostelId),
        roomId && eq(allocations.roomId, roomId),
        studentId && eq(allocations.studentId, studentId),
        phase && phaseCondition(allocations, phase, day),
        activeOn && isActive,
        activeOn && coversDay(allocations, activeOn),
        fromDate && isActive,
        fromDate && overlapsRange(allocations, fromDate, toDate)
      ].filter(Boolean)
    });
    return { ...result, rows: result.rows.map(row => present(row, day)) };
  },

  getById: async (ctx, allocationId, { dbc } = {}) => {
    const allocation = await hostelAllocationRepository.findById(ctx.tenantId, allocationId, {
      dbc,
      with: withDetails
    });
    if (!allocation) throw notFound("Allocation");
    return present(allocation, await today(ctx));
  },

  /* A bed for a current student from fromDate (default today) to toDate (open-ended when omitted).
     Future dates pre-book a bed (next year's room in March). The room is locked while its beds
     are checked, so two requests for one bed cannot both succeed; the exclusion constraints
     refuse any overlap that got past the checks. */
  create: async (ctx, { studentId, roomId, bedNumber, fromDate, toDate = null, notes }) => {
    const range = { fromDate: fromDate ?? (await today(ctx)), toDate };
    if (toDate && toDate < range.fromDate) throw unprocessable(`toDate cannot be before fromDate (${range.fromDate})`);
    const student = await residents.load(ctx, studentId);
    await residents.assertCurrent(ctx, student);

    const id = await guardOverlaps(() =>
      transaction(async tx => {
        const target = (await lockRooms(ctx, [roomId], { dbc: tx })).get(roomId);
        if (!target) throw unprocessable("roomId does not refer to an existing room");
        await assertStudentFree(ctx, student, range, { dbc: tx });
        const bed = await pickBed(ctx, { ...target, student, bedNumber, range }, { dbc: tx });

        const created = await hostelAllocationRepository.create(
          ctx.tenantId,
          {
            studentId,
            hostelId: target.hostel.id,
            roomId,
            bedNumber: bed,
            ...range,
            source: "DIRECT",
            allocatedBy: ctx.userId,
            notes
          },
          { dbc: tx }
        );
        return created.id;
      })
    );
    return allocationService.getById(ctx, id);
  },

  /* Notes, and extending or shortening the stay. The start can move only before it starts.
     Overlaps are checked again for the new range; resources tied to the bed follow it. */
  update: async (ctx, allocationId, { fromDate, toDate, notes }) => {
    const day = await today(ctx);
    await guardOverlaps(() =>
      transaction(async tx => {
        const current = await hostelAllocationRepository.lockForUpdate(ctx.tenantId, allocationId, { dbc: tx });
        if (!current) throw notFound("Allocation");
        const next = {
          fromDate: fromDate ?? current.fromDate,
          toDate: toDate === undefined ? current.toDate : toDate
        };
        const datesChange = next.fromDate !== current.fromDate || next.toDate !== current.toDate;

        if (datesChange) {
          if (current.status === "CANCELLED") throw conflict("This allocation is cancelled; book a new one instead");
          if (next.fromDate !== current.fromDate && current.fromDate < day) {
            throw unprocessable(`This allocation started on ${current.fromDate}; its start date can no longer change`);
          }
          if (next.toDate && next.toDate < next.fromDate) {
            throw unprocessable(`toDate cannot be before fromDate (${next.fromDate})`);
          }
          const target = (await lockRooms(ctx, [current.roomId], { dbc: tx })).get(current.roomId);
          if (!target) throw unprocessable("The allocation's room no longer exists");
          const student = await residents.load(ctx, current.studentId);
          await assertStudentFree(ctx, student, next, { dbc: tx, exceptIds: [current.id] });
          await pickBed(
            ctx,
            {
              ...target,
              student,
              bedNumber: current.bedNumber,
              range: next,
              continuing: true,
              exceptIds: [current.id]
            },
            { dbc: tx }
          );
        }
        const updated = await hostelAllocationRepository.update(
          ctx.tenantId,
          allocationId,
          {
            ...next,
            /* A plain date change: no longer ended by an action */
            ...(datesChange && { endReason: null, endedAt: null, endedBy: null }),
            ...(notes !== undefined && { notes })
          },
          { dbc: tx }
        );
        if (datesChange) await resourceAssignmentService.followAllocation(ctx, current, updated, { dbc: tx });
      })
    );
    return allocationService.getById(ctx, allocationId);
  },

  /* The student moves out on vacatedOn (default today; a later date plans the move-out).
     The row stays as history; resources tied to the bed end with it. */
  vacate: async (ctx, allocationId, { vacatedOn, notes }) => {
    const day = await today(ctx);
    const leavesOn = vacatedOn ?? day;
    await transaction(async tx => {
      const current = await hostelAllocationRepository.lockForUpdate(ctx.tenantId, allocationId, { dbc: tx });
      if (!current) throw notFound("Allocation");
      if (current.status === "CANCELLED") throw conflict("This allocation was cancelled; there is nothing to vacate");
      if (current.endReason) throw conflict(`This allocation ${ENDED_BY[current.endReason](current.toDate)}`);
      if (current.fromDate > day) {
        throw unprocessable(`This allocation starts on ${current.fromDate}; cancel it instead of vacating`);
      }
      if (leavesOn < current.fromDate) {
        throw unprocessable(`vacatedOn cannot be before the allocation's start (${current.fromDate})`);
      }
      if (current.toDate && leavesOn > current.toDate) {
        throw unprocessable(`vacatedOn cannot be after the allocation's end (${current.toDate}); extend it first`);
      }
      const updated = await hostelAllocationRepository.update(
        ctx.tenantId,
        allocationId,
        { toDate: leavesOn, ...ending(ctx, "VACATED"), notes: appendNote(current.notes, notes) },
        { dbc: tx }
      );
      await resourceAssignmentService.followAllocation(ctx, current, updated, { dbc: tx });
    });
    return allocationService.getById(ctx, allocationId);
  },

  /* A booking that has not started (today at the earliest) is withdrawn; its resources too */
  cancel: async (ctx, allocationId, { reason }) => {
    const day = await today(ctx);
    await transaction(async tx => {
      const current = await hostelAllocationRepository.lockForUpdate(ctx.tenantId, allocationId, { dbc: tx });
      if (!current) throw notFound("Allocation");
      if (current.status === "CANCELLED") throw conflict("This allocation is already cancelled");
      if (current.fromDate < day) {
        throw unprocessable(`This allocation started on ${current.fromDate}; vacate it instead of cancelling`);
      }
      const updated = await hostelAllocationRepository.update(
        ctx.tenantId,
        allocationId,
        { status: "CANCELLED", ...ending(ctx, "CANCELLED"), notes: appendNote(current.notes, reason) },
        { dbc: tx }
      );
      await resourceAssignmentService.followAllocation(ctx, current, updated, { dbc: tx });
    });
    return allocationService.getById(ctx, allocationId);
  },

  /* Move a resident to another bed from fromDate (default today, or the start of a booking that
     has not begun), in one transaction: the current allocation ends the day before (a booking
     moved before it starts is cancelled) and a new one, linked to it, runs to the old end date.
     Hostel-wide resources of the same hostel continue on the new bed; the others end. */
  transfer: async (ctx, allocationId, { roomId, bedNumber, fromDate, notes }) => {
    const day = await today(ctx);
    const id = await guardOverlaps(() =>
      transaction(async tx => {
        const current = await hostelAllocationRepository.lockForUpdate(ctx.tenantId, allocationId, { dbc: tx });
        if (!current) throw notFound("Allocation");
        if (current.status !== "ACTIVE") throw unprocessable("Only an active allocation can be transferred");
        if (current.endReason) throw conflict(`This allocation ${ENDED_BY[current.endReason](current.toDate)}`);
        const movesOn = fromDate ?? (current.fromDate > day ? current.fromDate : day);
        if (movesOn < current.fromDate) {
          throw unprocessable(`fromDate cannot be before the allocation's start (${current.fromDate})`);
        }
        if (current.toDate && movesOn > current.toDate) {
          throw unprocessable(`fromDate cannot be after the allocation's end (${current.toDate})`);
        }

        const rooms = await lockRooms(ctx, [current.roomId, roomId], { dbc: tx });
        const target = rooms.get(roomId);
        if (!target) throw unprocessable("roomId does not refer to an existing room");
        /* Within the room, the new bed must be named (the lowest free one could be their own) */
        if (roomId === current.roomId && (bedNumber === undefined || bedNumber === current.bedNumber)) {
          throw unprocessable(`The student is already in bed ${current.bedNumber} of ${roomLabel(target.room)}`);
        }
        const student = await residents.load(ctx, current.studentId);

        /* End the current bed first, so the student's own stay does not block the new one */
        const ended = await hostelAllocationRepository.update(
          ctx.tenantId,
          current.id,
          movesOn === current.fromDate
            ? { status: "CANCELLED", ...ending(ctx, "TRANSFERRED") }
            : { toDate: addDays(movesOn, -1), ...ending(ctx, "TRANSFERRED") },
          { dbc: tx }
        );
        const range = { fromDate: movesOn, toDate: current.toDate };
        const bed = await pickBed(ctx, { ...target, student, bedNumber, range }, { dbc: tx });
        await assertStudentFree(ctx, student, range, { dbc: tx });

        const created = await hostelAllocationRepository.create(
          ctx.tenantId,
          {
            studentId: current.studentId,
            hostelId: target.hostel.id,
            roomId,
            bedNumber: bed,
            ...range,
            source: "TRANSFER",
            previousAllocationId: current.id,
            allocatedBy: ctx.userId,
            notes
          },
          { dbc: tx }
        );
        await resourceAssignmentService.moveWithAllocation(ctx, current, ended, created, { dbc: tx });
        return created.id;
      })
    );
    return allocationService.getById(ctx, id);
  },

  /* For other submodules */

  /* ACTIVE allocations in these rooms that share a day with the range (default: today) */
  bookedBeds: async (ctx, roomIds, range, { dbc = db, withStudent = true, exceptIds = [] } = {}) => {
    if (!roomIds.length) return [];
    const day = range ? null : await today(ctx);
    const { fromDate, toDate } = range ?? { fromDate: day, toDate: day };
    return hostelAllocationRepository.findMany(ctx.tenantId, {
      dbc,
      conditions: [
        inArray(allocations.roomId, roomIds),
        isActive,
        overlapsRange(allocations, fromDate, toDate),
        exceptIds.length && notInArray(allocations.id, exceptIds)
      ].filter(Boolean),
      with: withStudent ? { student: studentColumns } : undefined
    });
  },

  /* Current and upcoming allocations (what a room or hostel change must not strand) */
  notEndedInRooms: async (ctx, roomIds, { dbc = db } = {}) =>
    roomIds.length
      ? hostelAllocationRepository.findMany(ctx.tenantId, {
          dbc,
          conditions: [inArray(allocations.roomId, roomIds), notEnded(allocations, await today(ctx))]
        })
      : [],

  notEndedInHostel: async (ctx, hostelId) =>
    hostelAllocationRepository.findMany(ctx.tenantId, {
      conditions: [eq(allocations.hostelId, hostelId), notEnded(allocations, await today(ctx))],
      with: { student: studentColumns }
    }),

  /* Current and upcoming beds of these students, with hostel, room and warden contact */
  notEndedForStudents: async (ctx, studentIds) => {
    if (!studentIds.length) return [];
    const day = await today(ctx);
    const rows = await hostelAllocationRepository.findMany(ctx.tenantId, {
      conditions: [inArray(allocations.studentId, studentIds), notEnded(allocations, day)],
      orderBy: [allocations.fromDate, allocations.createdAt],
      with: {
        ...withDetails,
        hostel: {
          columns: { id: true, name: true, code: true, residentGender: true, address: true, contactPhone: true },
          with: { warden: { columns: { firstName: true, lastName: true, phone: true } } }
        }
      }
    });
    return rows.map(row => present(row, day));
  },

  /* One allocation (any status), for tying resources to it */
  findById: (ctx, allocationId, { dbc = db } = {}) =>
    hostelAllocationRepository.findById(ctx.tenantId, allocationId, {
      dbc,
      with: { room: { columns: { roomNumber: true } }, hostel: { columns: { name: true } } }
    }),

  lockForUpdate: (ctx, allocationId, { dbc }) =>
    hostelAllocationRepository.lockForUpdate(ctx.tenantId, allocationId, { dbc })
};

/* Shared with the roll-over and leaver services of this submodule */
export const allocationInternals = { lockRooms, pickBed, ending, present, today, withDetails, studentColumns };
