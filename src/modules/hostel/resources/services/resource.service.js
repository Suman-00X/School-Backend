import { eq, inArray, ne } from "drizzle-orm";
import { db, transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { hostelService } from "../../hostels/index.js";
import { resourceAssignmentService } from "../../resource-assignments/index.js";
import { roomService } from "../../rooms/index.js";
import {
  DEFAULT_RESOURCE_CAPACITY,
  PLAN_TYPES,
  RESOURCE_TYPE_LABELS
} from "../../shared/constants/hostel.constants.js";
import { resourceLabel } from "../../shared/utils/hostel.util.js";
import { hostelResources as resources } from "../models/hostelResource.schema.js";
import { hostelResourceRepository } from "../repositories/hostelResource.repository.js";

const withPlace = {
  hostel: { columns: { id: true, name: true, code: true } },
  room: { columns: { id: true, roomNumber: true } }
};

/* Adds today's usage: inUse (holders today) and available (capacity left today) */
const withUsage = async (ctx, rows) => {
  const usage = await resourceAssignmentService.holdersOn(
    ctx,
    rows.map(row => row.id),
    await tenantToday(ctx.tenantId)
  );
  return rows.map(row => {
    const inUse = usage.get(row.id) ?? 0;
    return { ...row, inUse, available: Math.max(row.capacity - inUse, 0) };
  });
};

const assertNameFree = async (ctx, hostelId, name, exceptId) => {
  const taken = await hostelResourceRepository.exists(ctx.tenantId, [
    eq(resources.hostelId, hostelId),
    eq(resources.name, name),
    ...(exceptId ? [ne(resources.id, exceptId)] : [])
  ]);
  if (taken) throw conflict(`A resource named ${name} already exists in this hostel`);
};

export const resourceService = {
  list: async (ctx, { page, limit, hostelId, roomId, resourceType, status }) => {
    const result = await hostelResourceRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withPlace,
      conditions: [
        hostelId && eq(resources.hostelId, hostelId),
        roomId && eq(resources.roomId, roomId),
        resourceType && eq(resources.resourceType, resourceType),
        status && eq(resources.status, status)
      ].filter(Boolean)
    });
    return { ...result, rows: await withUsage(ctx, result.rows) };
  },

  getById: async (ctx, resourceId) => {
    const resource = await hostelResourceRepository.findById(ctx.tenantId, resourceId, { with: withPlace });
    if (!resource) throw notFound("Resource");
    return (await withUsage(ctx, [resource]))[0];
  },

  /* In a room (lockers, cupboards, tables) or hostel-wide (plans, shared lockers) */
  create: async (ctx, data) => {
    const hostel = await hostelService.findById(ctx, data.hostelId);
    if (!hostel) throw unprocessable("hostelId does not refer to an existing hostel");
    if (data.roomId) {
      if (PLAN_TYPES.includes(data.resourceType)) {
        throw unprocessable(
          `A ${RESOURCE_TYPE_LABELS[data.resourceType].toLowerCase()} is hostel-wide; leave roomId out`
        );
      }
      const room = await roomService.findById(ctx, data.roomId);
      if (!room) throw unprocessable("roomId does not refer to an existing room");
      if (room.hostelId !== hostel.id) throw unprocessable(`Room ${room.roomNumber} is not in ${hostel.name}`);
    }
    await assertNameFree(ctx, hostel.id, data.name);
    const resource = await hostelResourceRepository.create(ctx.tenantId, {
      ...data,
      capacity: data.capacity ?? DEFAULT_RESOURCE_CAPACITY[data.resourceType]
    });
    return resourceService.getById(ctx, resource.id);
  },

  /* Under a row lock, so an assignment cannot be made while capacity shrinks */
  update: async (ctx, resourceId, data) => {
    await transaction(async tx => {
      const [resource] = await hostelResourceRepository.lockForUpdate(ctx.tenantId, [resourceId], { dbc: tx });
      if (!resource) throw notFound("Resource");
      if (data.customType !== undefined && resource.resourceType !== "CUSTOM") {
        throw unprocessable("customType is only for CUSTOM resources");
      }
      if (data.name && data.name !== resource.name) await assertNameFree(ctx, resource.hostelId, data.name, resourceId);
      if (data.capacity !== undefined && data.capacity < resource.capacity) {
        const day = await tenantToday(ctx.tenantId);
        const { peak, day: busiest } = await resourceAssignmentService.peakFrom(ctx, resource.id, day, { dbc: tx });
        if (peak > data.capacity) {
          throw conflict(
            `${resourceLabel(resource)} is held by ${peak} students on ${busiest}; its capacity cannot be reduced to ${data.capacity}`
          );
        }
      }
      await hostelResourceRepository.update(ctx.tenantId, resourceId, data, { dbc: tx });
    });
    return resourceService.getById(ctx, resourceId);
  },

  /* Only once nobody holds it now or later; past assignments stay as history */
  remove: (ctx, resourceId) =>
    transaction(async tx => {
      const [resource] = await hostelResourceRepository.lockForUpdate(ctx.tenantId, [resourceId], { dbc: tx });
      if (!resource) throw notFound("Resource");
      const holders = await resourceAssignmentService.notEndedFor(ctx, { resourceIds: [resourceId] }, { dbc: tx });
      if (holders.length) {
        throw conflict(
          `${resourceLabel(resource)} has ${holders.length} current or upcoming assignment(s); release or cancel them first`
        );
      }
      return hostelResourceRepository.softDelete(ctx.tenantId, resourceId, { dbc: tx });
    }),

  /* For other submodules */

  /* Lock resources (in id order) inside the caller's transaction -> rows, missing ones left out */
  lockForUpdate: (ctx, resourceIds, { dbc }) =>
    hostelResourceRepository.lockForUpdate(ctx.tenantId, [...new Set(resourceIds)], { dbc }),

  findById: (ctx, resourceId, { dbc = db } = {}) =>
    hostelResourceRepository.findById(ctx.tenantId, resourceId, { dbc }),

  findManyByIds: (ctx, resourceIds, { dbc = db } = {}) =>
    resourceIds.length
      ? hostelResourceRepository.findMany(ctx.tenantId, { dbc, conditions: [inArray(resources.id, resourceIds)] })
      : [],

  /* Resources of a room or a hostel that is being removed: refused while anyone holds one */
  removeAllFor: async (ctx, { roomId, hostelId }, { dbc }) => {
    const rows = await hostelResourceRepository.findMany(ctx.tenantId, {
      dbc,
      conditions: [roomId ? eq(resources.roomId, roomId) : eq(resources.hostelId, hostelId)]
    });
    const held = await resourceAssignmentService.notEndedFor(ctx, { resourceIds: rows.map(row => row.id) }, { dbc });
    if (held.length) {
      const names = [...new Set(held.map(row => rows.find(r => r.id === row.resourceId)?.name))].join(", ");
      throw conflict(`Resources here are still held (${names}); release or cancel those assignments first`);
    }
    await hostelResourceRepository.softDeleteFor(ctx.tenantId, { roomId, hostelId }, { dbc });
  }
};
