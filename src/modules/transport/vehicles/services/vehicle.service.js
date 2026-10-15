import { eq, inArray, lte, ne, or } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { addDays, daysBetween } from "../../../../common/utils/date.util.js";
import { assignmentService } from "../../assignments/index.js";
import { routeService } from "../../routes/index.js";
import { DEFAULT_EXPIRY_WINDOW_DAYS, VEHICLE_DOCUMENTS } from "../../shared/constants/transport.constants.js";
import { routeLabel } from "../../shared/utils/format.util.js";
import { transportVehicles as vehicles } from "../models/vehicle.schema.js";
import { vehicleRepository } from "../repositories/vehicle.repository.js";

/* Documents expiring on or before today + windowDays (already expired ones included) */
const expiringDocuments = (vehicle, today, windowDays) => {
  const limit = addDays(today, windowDays);
  return VEHICLE_DOCUMENTS.filter(({ field }) => vehicle[field] && vehicle[field] <= limit).map(
    ({ field, document, label }) => ({
      document,
      label,
      expiresOn: vehicle[field],
      daysLeft: daysBetween(today, vehicle[field]),
      isExpired: vehicle[field] < today
    })
  );
};

const withCompliance = (vehicle, today, windowDays = DEFAULT_EXPIRY_WINDOW_DAYS) =>
  vehicle && { ...vehicle, expiringDocuments: expiringDocuments(vehicle, today, windowDays) };

const assertRegistrationFree = async (ctx, registrationNumber, exceptId) => {
  const existing = await vehicleRepository.findOne(ctx.tenantId, [eq(vehicles.registrationNumber, registrationNumber)]);
  if (existing && existing.id !== exceptId) {
    throw conflict(`A vehicle with registration number ${registrationNumber} already exists`);
  }
};

export const vehicleService = {
  /* ?status= and ?expiringWithinDays= (compliance: any document expiring within N days, or expired).
     Retired vehicles are left out of the compliance view unless ?status=RETIRED is asked for. */
  list: async (ctx, { page, limit, status, expiringWithinDays }) => {
    const today = await tenantToday(ctx.tenantId);
    const compliance = expiringWithinDays !== undefined;
    const limitDate = compliance && addDays(today, expiringWithinDays);
    const result = await vehicleRepository.list(ctx.tenantId, {
      page,
      limit,
      conditions: [
        status && eq(vehicles.status, status),
        compliance && !status && ne(vehicles.status, "RETIRED"),
        compliance && or(...VEHICLE_DOCUMENTS.map(({ field }) => lte(vehicles[field], limitDate)))
      ].filter(Boolean)
    });
    return { ...result, rows: result.rows.map(row => withCompliance(row, today, expiringWithinDays)) };
  },

  /* With the route the vehicle serves (or null) */
  getById: async (ctx, vehicleId) => {
    const vehicle = await vehicleRepository.findById(ctx.tenantId, vehicleId);
    if (!vehicle) throw notFound("Vehicle");
    const route = await routeService.findByVehicle(ctx, vehicleId);
    return {
      ...withCompliance(vehicle, await tenantToday(ctx.tenantId)),
      route: route && { id: route.id, name: route.name, code: route.code }
    };
  },

  create: async (ctx, data) => {
    await assertRegistrationFree(ctx, data.registrationNumber);
    const vehicle = await vehicleRepository.create(ctx.tenantId, data);
    return withCompliance(vehicle, await tenantToday(ctx.tenantId));
  },

  /* Capacity and retirement are checked against the route the vehicle serves,
     under that route's lock (the same lock new assignments take) */
  update: async (ctx, vehicleId, data) => {
    await transaction(async tx => {
      const vehicle = await vehicleRepository.lockForUpdate(ctx.tenantId, vehicleId, { dbc: tx });
      if (!vehicle) throw notFound("Vehicle");
      if (data.registrationNumber && data.registrationNumber !== vehicle.registrationNumber) {
        await assertRegistrationFree(ctx, data.registrationNumber, vehicleId);
      }

      const shrinking = data.capacity !== undefined && data.capacity < vehicle.capacity;
      if (shrinking || data.status === "RETIRED") {
        const route = await routeService.lockByVehicle(ctx, vehicleId, { dbc: tx });
        if (route && data.status === "RETIRED") {
          throw conflict(
            `Vehicle ${vehicle.registrationNumber} serves ${routeLabel(route)}; give the route another vehicle before retiring it`
          );
        }
        if (route && shrinking) {
          const assigned = await assignmentService.peakActiveCount(ctx, route.id, { dbc: tx });
          if (assigned > data.capacity) {
            throw unprocessable(
              `${routeLabel(route)} has ${assigned} students assigned; the vehicle needs at least ${assigned} seats`
            );
          }
        }
      }
      await vehicleRepository.update(ctx.tenantId, vehicleId, data, { dbc: tx });
    });
    return vehicleService.getById(ctx, vehicleId);
  },

  remove: (ctx, vehicleId) =>
    transaction(async tx => {
      const vehicle = await vehicleRepository.lockForUpdate(ctx.tenantId, vehicleId, { dbc: tx });
      if (!vehicle) throw notFound("Vehicle");
      const route = await routeService.lockByVehicle(ctx, vehicleId, { dbc: tx });
      if (route) {
        throw conflict(
          `Vehicle ${vehicle.registrationNumber} serves ${routeLabel(route)}; take it off the route before removing it`
        );
      }
      return vehicleRepository.softDelete(ctx.tenantId, vehicleId, { dbc: tx });
    }),

  /* For other submodules: null when missing */
  findById: (ctx, vehicleId, { dbc } = {}) => vehicleRepository.findById(ctx.tenantId, vehicleId, { dbc }),

  findManyByIds: (ctx, vehicleIds) =>
    vehicleIds.length
      ? vehicleRepository.findMany(ctx.tenantId, { conditions: [inArray(vehicles.id, [...new Set(vehicleIds)])] })
      : []
};
