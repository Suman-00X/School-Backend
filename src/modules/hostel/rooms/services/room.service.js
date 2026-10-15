import { eq, ne } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { allocationService } from "../../allocations/index.js";
import { hostelService } from "../../hostels/index.js";
import { freeBeds } from "../../shared/utils/hostel.util.js";
import { hostelRooms } from "../models/hostelRoom.schema.js";
import { hostelRoomRepository } from "../repositories/hostelRoom.repository.js";

const withHostel = { hostel: { columns: { id: true, name: true, code: true, residentGender: true } } };

/* Adds occupied / free bed counts to rooms (one query for all of them) */
const withOccupancy = async (ctx, rooms) => {
  const beds = await allocationService.activeBeds(
    ctx,
    rooms.map(room => room.id),
    { withStudent: false }
  );
  return rooms.map(room => {
    const taken = beds.filter(bed => bed.roomId === room.id).map(bed => bed.bedNumber);
    return { ...room, occupied: taken.length, freeBeds: freeBeds(room.capacity, taken) };
  });
};

const assertNumberFree = async (ctx, hostelId, roomNumber, exceptId) => {
  const taken = await hostelRoomRepository.exists(ctx.tenantId, [
    eq(hostelRooms.hostelId, hostelId),
    eq(hostelRooms.roomNumber, roomNumber),
    ...(exceptId ? [ne(hostelRooms.id, exceptId)] : [])
  ]);
  if (taken) throw conflict(`Room ${roomNumber} already exists in this hostel`);
};

/* Capacity and status changes must not strand current residents */
const assertResidentsFit = (room, changes, takenBeds) => {
  if (!takenBeds.length) return;
  const label = `Room ${room.roomNumber}`;
  if (changes.status === "CLOSED") {
    throw conflict(`${label} has ${takenBeds.length} resident(s); vacate or transfer them before closing it`);
  }
  if (changes.capacity !== undefined) {
    if (changes.capacity < takenBeds.length) {
      throw conflict(
        `${label} has ${takenBeds.length} resident(s); its capacity cannot be reduced to ${changes.capacity}`
      );
    }
    const outside = takenBeds.filter(bed => bed > changes.capacity).sort((a, b) => a - b);
    if (outside.length) {
      const beds = outside.length === 1 ? `Bed ${outside[0]} is` : `Beds ${outside.join(", ")} are`;
      throw conflict(
        `${beds} occupied in ${label}; move the residents before reducing its capacity to ${changes.capacity}`
      );
    }
  }
};

export const roomService = {
  list: async (ctx, { page, limit, hostelId, status, floor }) => {
    const result = await hostelRoomRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withHostel,
      conditions: [
        hostelId && eq(hostelRooms.hostelId, hostelId),
        status && eq(hostelRooms.status, status),
        floor !== undefined && eq(hostelRooms.floor, floor)
      ].filter(Boolean)
    });
    return { ...result, rows: await withOccupancy(ctx, result.rows) };
  },

  getById: async (ctx, roomId) => {
    const room = await hostelRoomRepository.findById(ctx.tenantId, roomId, { with: withHostel });
    if (!room) throw notFound("Room");
    return (await withOccupancy(ctx, [room]))[0];
  },

  create: async (ctx, data) => {
    if (!(await hostelService.exists(ctx, data.hostelId))) {
      throw unprocessable("hostelId does not refer to an existing hostel");
    }
    await assertNumberFree(ctx, data.hostelId, data.roomNumber);
    const room = await hostelRoomRepository.create(ctx.tenantId, data);
    return roomService.getById(ctx, room.id);
  },

  /* Under a row lock, so a bed cannot be allocated while capacity shrinks */
  update: async (ctx, roomId, data) => {
    await transaction(async tx => {
      const [room] = await hostelRoomRepository.lockForUpdate(ctx.tenantId, [roomId], { dbc: tx });
      if (!room) throw notFound("Room");
      if (data.roomNumber && data.roomNumber !== room.roomNumber) {
        await assertNumberFree(ctx, room.hostelId, data.roomNumber, roomId);
      }
      if (data.capacity !== undefined || data.status === "CLOSED") {
        const beds = await allocationService.activeBeds(ctx, [roomId], { dbc: tx, withStudent: false });
        assertResidentsFit(
          room,
          data,
          beds.map(bed => bed.bedNumber)
        );
      }
      await hostelRoomRepository.update(ctx.tenantId, roomId, data, { dbc: tx });
    });
    return roomService.getById(ctx, roomId);
  },

  remove: (ctx, roomId) =>
    transaction(async tx => {
      const [room] = await hostelRoomRepository.lockForUpdate(ctx.tenantId, [roomId], { dbc: tx });
      if (!room) throw notFound("Room");
      const beds = await allocationService.activeBeds(ctx, [roomId], { dbc: tx, withStudent: false });
      if (beds.length) {
        throw conflict(`Room ${room.roomNumber} has ${beds.length} resident(s); vacate or transfer them first`);
      }
      return hostelRoomRepository.softDelete(ctx.tenantId, roomId, { dbc: tx });
    }),

  /* For other submodules */

  /* Lock rooms (in id order) inside the caller's transaction -> rows, missing ones left out */
  lockForUpdate: (ctx, roomIds, { dbc }) => hostelRoomRepository.lockForUpdate(ctx.tenantId, roomIds, { dbc }),

  findAllForHostel: (ctx, hostelId) =>
    hostelRoomRepository.findMany(ctx.tenantId, { conditions: [eq(hostelRooms.hostelId, hostelId)] }),

  removeAllForHostel: (ctx, hostelId, { dbc }) =>
    hostelRoomRepository.softDeleteForHostel(ctx.tenantId, hostelId, { dbc })
};
