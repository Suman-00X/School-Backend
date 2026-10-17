import { eq, ne } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { nextCode, pad } from "../../../../common/sequences/sequence.service.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { accountService } from "../../../users/accounts/index.js";
import { allocationService } from "../../allocations/index.js";
import { resourceService } from "../../resources/index.js";
import { roomService } from "../../rooms/index.js";
import { WARDEN_ROLES } from "../../shared/constants/hostel.constants.js";
import { freeBeds, fullName, genderMismatch } from "../../shared/utils/hostel.util.js";
import { hostels } from "../models/hostel.schema.js";
import { hostelRepository } from "../repositories/hostel.repository.js";

const withWarden = {
  warden: { columns: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true } }
};

const canBeWarden = user => Boolean(user) && user.status === "ACTIVE" && WARDEN_ROLES.includes(user.role);

/* The warden must be an active employee account */
const assertWarden = async (ctx, wardenUserId) => {
  if (!wardenUserId) return;
  const [user] = await accountService.findManyByIds(ctx, [wardenUserId]);
  if (!canBeWarden(user)) {
    throw unprocessable(
      `wardenUserId must be an active employee account (${WARDEN_ROLES.join(", ")})${user ? `; ${fullName(user)} is a ${user.role.toLowerCase()} account` : ""}`
    );
  }
};

/* Readable duplicates before the unique indexes would reject them */
const assertUnique = async (ctx, { name, code }, exceptId) => {
  const others = exceptId ? [ne(hostels.id, exceptId)] : [];
  if (name && (await hostelRepository.exists(ctx.tenantId, [eq(hostels.name, name), ...others]))) {
    throw conflict(`A hostel named ${name} already exists`);
  }
  if (code && (await hostelRepository.exists(ctx.tenantId, [eq(hostels.code, code), ...others]))) {
    throw conflict(`A hostel with code ${code} already exists`);
  }
};

/* Switching a hostel to boys- or girls-only must not leave current or upcoming residents who do not fit */
const assertResidentsFit = async (ctx, hostel) => {
  const residents = await allocationService.notEndedInHostel(ctx, hostel.id);
  if (!residents.length) return;
  const accounts = await accountService.findManyByIds(
    ctx,
    residents.map(r => r.student.userId)
  );
  for (const account of accounts) {
    const problem = genderMismatch(hostel, account);
    if (problem) throw unprocessable(`${problem}. Move them before changing the hostel's residents`);
  }
};

export const hostelService = {
  list: (ctx, { page, limit, residentGender }) =>
    hostelRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withWarden,
      conditions: [residentGender && eq(hostels.residentGender, residentGender)].filter(Boolean)
    }),

  getById: async (ctx, hostelId) => {
    const hostel = await hostelRepository.findById(ctx.tenantId, hostelId, { with: withWarden });
    if (!hostel) throw notFound("Hostel");
    return hostel;
  },

  /* The code is generated (HST-001) when not given */
  create: async (ctx, data) => {
    await assertWarden(ctx, data.wardenUserId);
    await assertUnique(ctx, data);
    const id = await transaction(async tx => {
      const code = data.code ?? (await nextCode(ctx.tenantId, "HOSTEL", n => `HST-${pad(n, 3)}`, { dbc: tx }));
      return (await hostelRepository.create(ctx.tenantId, { ...data, code }, { dbc: tx })).id;
    });
    return hostelService.getById(ctx, id);
  },

  update: async (ctx, hostelId, data) => {
    const existing = await hostelService.getById(ctx, hostelId);
    await assertWarden(ctx, data.wardenUserId);
    await assertUnique(ctx, data, hostelId);
    if (data.residentGender && data.residentGender !== existing.residentGender) {
      await assertResidentsFit(ctx, { ...existing, ...data });
    }
    await hostelRepository.update(ctx.tenantId, hostelId, data);
    return hostelService.getById(ctx, hostelId);
  },

  /* Removes the hostel, its rooms and resources; only once nobody lives there now or later */
  remove: async (ctx, hostelId) => {
    const hostel = await hostelService.getById(ctx, hostelId);
    const residents = await allocationService.notEndedInHostel(ctx, hostelId);
    if (residents.length) {
      throw conflict(
        `${hostel.name} still has ${residents.length} current or upcoming allocation(s); vacate, cancel or transfer them first`
      );
    }
    return transaction(async tx => {
      await resourceService.removeAllFor(ctx, { hostelId }, { dbc: tx });
      await roomService.removeAllForHostel(ctx, hostelId, { dbc: tx });
      return hostelRepository.softDelete(ctx.tenantId, hostelId, { dbc: tx });
    });
  },

  /* Beds taken and free in every room on one day (default today), with totals */
  occupancy: async (ctx, hostelId, { on } = {}) => {
    const hostel = await hostelService.getById(ctx, hostelId);
    const day = on ?? (await tenantToday(ctx.tenantId));
    const rooms = await roomService.findAllForHostel(ctx, hostelId);
    const beds = await allocationService.bookedBeds(
      ctx,
      rooms.map(room => room.id),
      { fromDate: day, toDate: day }
    );

    const roomRows = rooms.map(room => {
      const occupants = beds
        .filter(bed => bed.roomId === room.id)
        .sort((a, b) => a.bedNumber - b.bedNumber)
        .map(bed => ({
          bedNumber: bed.bedNumber,
          allocationId: bed.id,
          toDate: bed.toDate,
          student: { id: bed.student.id, studentCode: bed.student.studentCode, name: fullName(bed.student.user) }
        }));
      const free = freeBeds(
        room.capacity,
        occupants.map(o => o.bedNumber)
      );
      return {
        id: room.id,
        roomNumber: room.roomNumber,
        floor: room.floor,
        roomType: room.roomType,
        status: room.status,
        capacity: room.capacity,
        occupied: occupants.length,
        free: free.length,
        freeBeds: free,
        occupants
      };
    });

    const total = key => roomRows.reduce((sum, room) => sum + room[key], 0);
    return {
      hostel: { id: hostel.id, name: hostel.name, code: hostel.code, residentGender: hostel.residentGender },
      on: day,
      totals: {
        rooms: roomRows.length,
        capacity: total("capacity"),
        occupied: total("occupied"),
        free: total("free"),
        /* Free beds that can be allocated now (room AVAILABLE) */
        allocatable: roomRows.filter(room => room.status === "AVAILABLE").reduce((sum, room) => sum + room.free, 0)
      },
      rooms: roomRows
    };
  },

  /* For other submodules: an active hostel, or null */
  findById: (ctx, hostelId, options) => hostelRepository.findById(ctx.tenantId, hostelId, options),

  exists: (ctx, hostelId) => hostelRepository.exists(ctx.tenantId, [eq(hostels.id, hostelId)])
};

/* Handover (registered in src/routes.js): the hostels a departing warden looks after go to
   the person taking over. Only the warden changes; who allocated beds stays as recorded. */
export const wardenHandover = {
  kind: "hostelWardens",
  label: "Hostels (warden)",
  reassign: async (ctx, { fromUserId, toUser }, { dbc }) => {
    const moved = await hostelRepository.reassignWarden(ctx.tenantId, fromUserId, toUser.id, { dbc });
    if (moved.length && !canBeWarden(toUser)) {
      throw unprocessable(
        `${fullName(toUser)} cannot be a hostel warden: wardens have ${WARDEN_ROLES.join(", ")} accounts, and theirs is ${toUser.role}`
      );
    }
    return moved.map(hostel => ({ id: hostel.id, name: `${hostel.name} (${hostel.code})` }));
  }
};
