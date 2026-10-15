import { eq, inArray } from "drizzle-orm";
import { db, transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { enrollmentService } from "../../../academics/enrollments/index.js";
import { accountService } from "../../../users/accounts/index.js";
import { studentService } from "../../../users/students/index.js";
import { hostelService } from "../../hostels/index.js";
import { roomService } from "../../rooms/index.js";
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

/* The student behind an allocation request, with the account fields the rules need */
const loadStudent = async (ctx, studentId) => {
  const [student] = await studentService.findManyByIds(ctx, [studentId]);
  if (!student) throw unprocessable("studentId does not refer to an existing student");
  const [account] = await accountService.findManyByIds(ctx, [student.userId]);
  return { ...student, account: account ?? student.user, name: fullName(student.user) };
};

/* A student holds at most one bed at a time, in any academic year */
const assertNoActiveAllocation = async (ctx, student, { dbc }) => {
  const current = await hostelAllocationRepository.findOne(
    ctx.tenantId,
    [eq(allocations.studentId, student.id), isActive],
    {
      dbc,
      with: { room: { columns: { roomNumber: true } }, hostel: { columns: { name: true } } }
    }
  );
  if (current) {
    throw conflict(
      `${student.name} already has bed ${current.bedNumber} in ${roomLabel(current.room, current.hostel)}; vacate or transfer that allocation first`
    );
  }
};

/* The bed a student gets in a locked room: the requested one, or the lowest free one.
   `ignoreAllocationId` is the student's own current bed (a transfer within the room). */
const pickBed = async (ctx, { room, hostel, student, bedNumber, ignoreAllocationId }, { dbc }) => {
  const label = roomLabel(room, hostel);
  if (room.status !== "AVAILABLE") {
    throw unprocessable(
      `${label} is ${room.status === "CLOSED" ? "closed" : "under maintenance"} and cannot take residents`
    );
  }
  const mismatch = genderMismatch(hostel, student.account);
  if (mismatch) throw unprocessable(mismatch);

  const taken = (await allocationService.activeBeds(ctx, [room.id], { dbc, withStudent: false }))
    .filter(bed => bed.id !== ignoreAllocationId)
    .map(bed => bed.bedNumber);

  if (bedNumber !== undefined) {
    if (bedNumber > room.capacity) {
      throw unprocessable(`${label} has beds 1 to ${room.capacity}; bed ${bedNumber} does not exist`);
    }
    if (taken.includes(bedNumber)) throw conflict(`Bed ${bedNumber} in ${label} is already taken`);
    return bedNumber;
  }
  const [lowest] = freeBeds(room.capacity, taken);
  if (!lowest) throw unprocessable(`${label} is full (${room.capacity} of ${room.capacity} beds taken)`);
  return lowest;
};

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

const assertDateInYear = (field, value, year) => {
  if (value < year.startDate || value > year.endDate) {
    throw unprocessable(`${field} ${value} is outside the academic year ${year.yearName}`);
  }
};

export const allocationService = {
  /* Year-scoped */
  list: (ctx, { page, limit, hostelId, roomId, studentId, status }) =>
    hostelAllocationRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withDetails,
      conditions: [
        eq(allocations.academicYearId, ctx.academicYearId),
        hostelId && eq(allocations.hostelId, hostelId),
        roomId && eq(allocations.roomId, roomId),
        studentId && eq(allocations.studentId, studentId),
        status && eq(allocations.status, status)
      ].filter(Boolean)
    }),

  getById: async (ctx, allocationId) => {
    const allocation = await hostelAllocationRepository.findById(ctx.tenantId, allocationId, { with: withDetails });
    if (!allocation) throw notFound("Allocation");
    return allocation;
  },

  /* A bed for a student actively enrolled in the resolved academic year.
     The room is locked while its beds are counted, so two requests for the
     last bed cannot both succeed. */
  create: async (ctx, { studentId, roomId, bedNumber, allocatedOn, notes }) => {
    const year = ctx.academicYear;
    const student = await loadStudent(ctx, studentId);
    const enrollment = await enrollmentService.findForStudent(ctx, studentId, year.id);
    if (enrollment?.status !== "ACTIVE") {
      throw unprocessable(`${student.name} is not actively enrolled in ${year.yearName}`);
    }
    const today = await tenantToday(ctx.tenantId);
    const startsOn = allocatedOn ?? today;
    if (startsOn > today) throw unprocessable("allocatedOn cannot be in the future");
    assertDateInYear("allocatedOn", startsOn, year);

    const id = await transaction(async tx => {
      const target = (await lockRooms(ctx, [roomId], { dbc: tx })).get(roomId);
      if (!target) throw unprocessable("roomId does not refer to an existing room");
      await assertNoActiveAllocation(ctx, student, { dbc: tx });
      const bed = await pickBed(ctx, { ...target, student, bedNumber }, { dbc: tx });

      const created = await hostelAllocationRepository.create(
        ctx.tenantId,
        {
          academicYearId: year.id,
          studentId,
          hostelId: target.hostel.id,
          roomId,
          bedNumber: bed,
          allocatedOn: startsOn,
          status: "ACTIVE",
          allocatedBy: ctx.userId,
          notes
        },
        { dbc: tx }
      );
      return created.id;
    });
    return allocationService.getById(ctx, id);
  },

  /* The student leaves the bed; the row stays as history */
  vacate: async (ctx, allocationId, { vacatedOn, notes }) => {
    const today = await tenantToday(ctx.tenantId);
    const leavesOn = vacatedOn ?? today;
    await transaction(async tx => {
      const allocation = await hostelAllocationRepository.lockForUpdate(ctx.tenantId, allocationId, { dbc: tx });
      if (!allocation) throw notFound("Allocation");
      if (allocation.status === "VACATED") {
        throw conflict(`This allocation was already vacated on ${allocation.vacatedOn}`);
      }
      if (leavesOn < allocation.allocatedOn) {
        throw unprocessable(`vacatedOn cannot be before the allocation date (${allocation.allocatedOn})`);
      }
      if (leavesOn > today) throw unprocessable("vacatedOn cannot be in the future");
      await hostelAllocationRepository.update(
        ctx.tenantId,
        allocationId,
        {
          status: "VACATED",
          vacatedOn: leavesOn,
          vacatedBy: ctx.userId,
          ...(notes && { notes: allocation.notes ? `${allocation.notes}\n${notes}` : notes })
        },
        { dbc: tx }
      );
    });
    return allocationService.getById(ctx, allocationId);
  },

  /* Move a resident to another bed in one transaction: the current allocation
     is vacated and a new one starts on the same day -> the new allocation */
  transfer: async (ctx, allocationId, { roomId, bedNumber, transferredOn, notes }) => {
    const today = await tenantToday(ctx.tenantId);
    const movesOn = transferredOn ?? today;

    const id = await transaction(async tx => {
      const current = await hostelAllocationRepository.lockForUpdate(ctx.tenantId, allocationId, { dbc: tx });
      if (!current) throw notFound("Allocation");
      if (current.status !== "ACTIVE") throw unprocessable("Only an active allocation can be transferred");
      if (movesOn < current.allocatedOn) {
        throw unprocessable(`transferredOn cannot be before the allocation date (${current.allocatedOn})`);
      }
      if (movesOn > today) throw unprocessable("transferredOn cannot be in the future");
      const year = await academicYearService.findById(ctx, current.academicYearId);
      assertDateInYear("transferredOn", movesOn, year);

      const rooms = await lockRooms(ctx, [current.roomId, roomId], { dbc: tx });
      const target = rooms.get(roomId);
      if (!target) throw unprocessable("roomId does not refer to an existing room");
      if (roomId === current.roomId && (bedNumber === undefined || bedNumber === current.bedNumber)) {
        throw unprocessable(`The student is already in bed ${current.bedNumber} of ${roomLabel(target.room)}`);
      }
      const student = await loadStudent(ctx, current.studentId);
      const bed = await pickBed(ctx, { ...target, student, bedNumber, ignoreAllocationId: current.id }, { dbc: tx });

      await hostelAllocationRepository.update(
        ctx.tenantId,
        current.id,
        { status: "VACATED", vacatedOn: movesOn, vacatedBy: ctx.userId },
        { dbc: tx }
      );
      const created = await hostelAllocationRepository.create(
        ctx.tenantId,
        {
          academicYearId: current.academicYearId,
          studentId: current.studentId,
          hostelId: target.hostel.id,
          roomId,
          bedNumber: bed,
          allocatedOn: movesOn,
          status: "ACTIVE",
          transferredFromId: current.id,
          allocatedBy: ctx.userId,
          notes
        },
        { dbc: tx }
      );
      return created.id;
    });
    return allocationService.getById(ctx, id);
  },

  update: async (ctx, allocationId, { notes }) => {
    const row = await hostelAllocationRepository.update(ctx.tenantId, allocationId, { notes });
    if (!row) throw notFound("Allocation");
    return allocationService.getById(ctx, allocationId);
  },

  /* For other submodules */

  /* Active allocations in these rooms (any academic year: a bed is a physical place) */
  activeBeds: async (ctx, roomIds, { dbc = db, withStudent = true } = {}) =>
    roomIds.length
      ? hostelAllocationRepository.findMany(ctx.tenantId, {
          dbc,
          conditions: [inArray(allocations.roomId, roomIds), isActive],
          with: withStudent ? { student: studentColumns } : undefined
        })
      : [],

  activeInHostel: (ctx, hostelId) =>
    hostelAllocationRepository.findMany(ctx.tenantId, {
      conditions: [eq(allocations.hostelId, hostelId), isActive],
      with: { student: studentColumns }
    }),

  /* Current beds of these students, with hostel, room and warden contact */
  activeForStudents: (ctx, studentIds) =>
    studentIds.length
      ? hostelAllocationRepository.findMany(ctx.tenantId, {
          conditions: [inArray(allocations.studentId, studentIds), isActive],
          with: {
            ...withDetails,
            hostel: {
              columns: { id: true, name: true, code: true, residentGender: true, address: true, contactPhone: true },
              with: { warden: { columns: { firstName: true, lastName: true, phone: true } } }
            }
          }
        })
      : []
};
