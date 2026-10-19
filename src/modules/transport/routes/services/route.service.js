import { asc, eq } from "drizzle-orm";
import { sameText } from "../../../../common/database/duplicates.js";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { nextCode, pad } from "../../../../common/sequences/sequence.service.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { assignmentService } from "../../assignments/index.js";
import { routeLabel } from "../../shared/utils/format.util.js";
import { vehicleService } from "../../vehicles/index.js";
import { transportRouteStops as stops, transportRoutes as routes } from "../models/route.schema.js";
import { routeRepository } from "../repositories/route.repository.js";
import { routeStopRepository } from "../repositories/routeStop.repository.js";

const VEHICLE_COLUMNS = {
  id: true,
  registrationNumber: true,
  make: true,
  model: true,
  capacity: true,
  status: true,
  driverName: true,
  driverPhone: true,
  attendantName: true,
  attendantPhone: true
};

const withDetails = {
  vehicle: { columns: VEHICLE_COLUMNS },
  stops: { where: (stop, { eq: equals }) => equals(stop.isActive, true), orderBy: [asc(stops.sequence)] }
};

/* The year occupancy is counted in: the request's year (X-Academic-Year-Id) or the current one */
const yearFor = async ctx => ctx.academicYear ?? (await academicYearService.findCurrent(ctx));

const occupancyOf = (vehicle, assigned, year) => ({
  academicYearId: year?.id ?? null,
  yearName: year?.yearName ?? null,
  capacity: vehicle?.capacity ?? null,
  assigned,
  available: vehicle ? Math.max(vehicle.capacity - assigned, 0) : null
});

/* Full replacement semantics: optional fields left out of a stop are cleared */
const normaliseStops = list =>
  list.map((s, index) => ({
    ...(s.id && { id: s.id }),
    name: s.name,
    sequence: s.sequence ?? index + 1,
    pickupTime: s.pickupTime ?? null,
    dropTime: s.dropTime ?? null,
    landmark: s.landmark ?? null,
    monthlyFee: s.monthlyFee ?? 0
  }));

const assertUnique = async (ctx, { name, code }, exceptId) => {
  if (name) {
    const existing = await routeRepository.findOne(ctx.tenantId, [sameText(routes.name, name)]);
    if (existing && existing.id !== exceptId) throw conflict(`A route named ${name} already exists`);
  }
  if (code) {
    const existing = await routeRepository.findOne(ctx.tenantId, [eq(routes.code, code)]);
    if (existing && existing.id !== exceptId) throw conflict(`A route with code ${code} already exists`);
  }
};

/* RT-001, skipping codes already chosen by hand */
const generateCode = async (ctx, dbc) => {
  for (;;) {
    const code = await nextCode(ctx.tenantId, "TRANSPORT-ROUTE", n => `RT-${pad(n, 3)}`, { dbc });
    if (!(await routeRepository.exists(ctx.tenantId, [eq(routes.code, code)], { dbc }))) return code;
  }
};

/* A vehicle a route may use: exists, not retired, not serving another route */
const usableVehicle = async (ctx, vehicleId, routeId, dbc) => {
  const vehicle = await vehicleService.findById(ctx, vehicleId, { dbc });
  if (!vehicle) throw unprocessable("vehicleId does not refer to an existing vehicle");
  if (vehicle.status === "RETIRED") throw unprocessable(`Vehicle ${vehicle.registrationNumber} is retired`);
  const serving = await routeRepository.findOne(ctx.tenantId, [eq(routes.vehicleId, vehicleId)], { dbc });
  if (serving && serving.id !== routeId) {
    throw conflict(`Vehicle ${vehicle.registrationNumber} already serves ${routeLabel(serving)} (${serving.name})`);
  }
  return vehicle;
};

/* Split the new stop list against the current one; refuses ids from other routes and
   removing stops students still use */
const planStops = async (ctx, route, incoming, dbc) => {
  const current = await routeStopRepository.findMany(ctx.tenantId, {
    conditions: [eq(stops.routeId, route.id)],
    dbc
  });
  const currentIds = new Set(current.map(stop => stop.id));
  const stranger = incoming.find(stop => stop.id && !currentIds.has(stop.id));
  if (stranger) throw unprocessable(`Stop ${stranger.id} (${stranger.name}) is not on ${routeLabel(route)}`);

  const keptIds = new Set(incoming.filter(stop => stop.id).map(stop => stop.id));
  const removed = current.filter(stop => !keptIds.has(stop.id));
  if (removed.length) {
    const inUse = await assignmentService.activeCountsByStop(ctx, route.id, { dbc });
    const blocked = removed.filter(stop => inUse.get(stop.id));
    if (blocked.length) {
      const list = blocked.map(stop => `${stop.name} (${inUse.get(stop.id)})`).join(", ");
      throw conflict(`Students still use stop(s) ${list}; end or move their assignments before removing the stop`);
    }
  }
  return {
    keep: incoming.filter(stop => stop.id),
    add: incoming.filter(stop => !stop.id),
    removeIds: removed.map(stop => stop.id)
  };
};

export const routeService = {
  /* Each route with its vehicle, stops and occupancy in the request's year */
  list: async (ctx, { page, limit, vehicleId }) => {
    const result = await routeRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withDetails,
      conditions: [vehicleId && eq(routes.vehicleId, vehicleId)].filter(Boolean)
    });
    const year = await yearFor(ctx);
    const counts = year
      ? await assignmentService.activeCountsByRoute(
          ctx,
          result.rows.map(route => route.id),
          year.id
        )
      : new Map();
    return {
      ...result,
      rows: result.rows.map(route => ({
        ...route,
        occupancy: occupancyOf(route.vehicle, counts.get(route.id) ?? 0, year)
      }))
    };
  },

  getById: async (ctx, routeId) => {
    const route = await routeRepository.findById(ctx.tenantId, routeId, { with: withDetails });
    if (!route) throw notFound("Route");
    const year = await yearFor(ctx);
    const perStop = year
      ? await assignmentService.activeCountsByStop(ctx, routeId, { academicYearId: year.id })
      : new Map();
    const assigned = [...perStop.values()].reduce((total, n) => total + n, 0);
    return {
      ...route,
      stops: route.stops.map(stop => ({ ...stop, assignedCount: perStop.get(stop.id) ?? 0 })),
      occupancy: occupancyOf(route.vehicle, assigned, year)
    };
  },

  create: async (ctx, { stops: stopList, ...data }) => {
    await assertUnique(ctx, data);
    const id = await transaction(async tx => {
      if (data.vehicleId) await usableVehicle(ctx, data.vehicleId, null, tx);
      const route = await routeRepository.create(
        ctx.tenantId,
        { ...data, code: data.code ?? (await generateCode(ctx, tx)) },
        { dbc: tx }
      );
      await routeStopRepository.insertForRoute(ctx.tenantId, route.id, normaliseStops(stopList), { dbc: tx });
      return route.id;
    });
    return routeService.getById(ctx, id);
  },

  /* `stops` replaces the whole list; `vehicleId: null` takes the vehicle off the route */
  update: async (ctx, routeId, { stops: stopList, ...data }) => {
    await transaction(async tx => {
      const route = await routeRepository.lockForUpdate(ctx.tenantId, routeId, { dbc: tx });
      if (!route) throw notFound("Route");
      await assertUnique(ctx, data, routeId);

      if (data.vehicleId && data.vehicleId !== route.vehicleId) {
        const vehicle = await usableVehicle(ctx, data.vehicleId, routeId, tx);
        const assigned = await assignmentService.peakActiveCount(ctx, routeId, { dbc: tx });
        if (assigned > vehicle.capacity) {
          throw unprocessable(
            `Vehicle ${vehicle.registrationNumber} has ${vehicle.capacity} seats but ${routeLabel(route)} has ${assigned} students assigned`
          );
        }
      }
      if (stopList) {
        const plan = await planStops(ctx, route, normaliseStops(stopList), tx);
        await routeStopRepository.replaceForRoute(ctx.tenantId, routeId, plan, { dbc: tx });
      }
      await routeRepository.update(ctx.tenantId, routeId, data, { dbc: tx });
    });
    return routeService.getById(ctx, routeId);
  },

  remove: (ctx, routeId) =>
    transaction(async tx => {
      const route = await routeRepository.lockForUpdate(ctx.tenantId, routeId, { dbc: tx });
      if (!route) throw notFound("Route");
      const assigned = await assignmentService.peakActiveCount(ctx, routeId, { dbc: tx });
      if (assigned) {
        throw conflict(
          `${routeLabel(route)} has ${assigned} active assignment(s); end or move them before removing it`
        );
      }
      return routeRepository.softDelete(ctx.tenantId, routeId, { dbc: tx });
    }),

  /* For other submodules */

  /* Lock the route (the capacity lock); null when missing */
  lockForUpdate: (ctx, routeId, { dbc }) => routeRepository.lockForUpdate(ctx.tenantId, routeId, { dbc }),

  lockByVehicle: (ctx, vehicleId, { dbc }) => routeRepository.lockByVehicle(ctx.tenantId, vehicleId, { dbc }),

  findByVehicle: (ctx, vehicleId) => routeRepository.findOne(ctx.tenantId, [eq(routes.vehicleId, vehicleId)]),

  /* Route with vehicle and active stops in order; null when missing */
  findWithStops: (ctx, routeId) => routeRepository.findById(ctx.tenantId, routeId, { with: withDetails }),

  /* An active stop of the route, or null */
  findStop: (ctx, routeId, stopId, { dbc } = {}) =>
    routeStopRepository.findOne(ctx.tenantId, [eq(stops.id, stopId), eq(stops.routeId, routeId)], { dbc })
};
