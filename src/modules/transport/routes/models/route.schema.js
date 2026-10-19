import { relations, sql } from "drizzle-orm";
import { check, integer, pgTable, text, time, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { money } from "../../shared/models/money.columns.js";
import { transportVehicles } from "../../vehicles/models/vehicle.schema.js";

/* A bus route. A vehicle serves at most one active route at a time. */
export const transportRoutes = pgTable(
  "transport_routes",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    vehicleId: uuid("vehicle_id").references(() => transportVehicles.id),
    description: text("description")
  },
  t => [
    uniqueIndex("transport_routes_tenant_name_uq")
      .on(t.tenantId, sql`lower(${t.name})`)
      .where(activeRows(t)),
    uniqueIndex("transport_routes_tenant_code_uq").on(t.tenantId, t.code).where(activeRows(t)),
    uniqueIndex("transport_routes_vehicle_uq")
      .on(t.vehicleId)
      .where(sql`${t.isActive} = true AND ${t.vehicleId} IS NOT NULL`)
  ]
);

/* Ordered stops of a route. Removed stops are soft-deleted so past assignments keep their stop. */
export const transportRouteStops = pgTable(
  "transport_route_stops",
  {
    ...baseColumns(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => transportRoutes.id),
    name: text("name").notNull(),
    sequence: integer("sequence").notNull(),
    pickupTime: time("pickup_time"),
    dropTime: time("drop_time"),
    landmark: text("landmark"),
    monthlyFee: money("monthly_fee").notNull().default(0)
  },
  t => [
    uniqueIndex("transport_route_stops_route_sequence_uq").on(t.routeId, t.sequence).where(activeRows(t)),
    uniqueIndex("transport_route_stops_route_name_uq")
      .on(t.routeId, sql`lower(${t.name})`)
      .where(activeRows(t)),
    check("transport_route_stops_sequence_chk", sql`${t.sequence} > 0`),
    check("transport_route_stops_fee_chk", sql`${t.monthlyFee} >= 0`)
  ]
);

export const transportRoutesRelations = relations(transportRoutes, ({ many, one }) => ({
  vehicle: one(transportVehicles, { fields: [transportRoutes.vehicleId], references: [transportVehicles.id] }),
  stops: many(transportRouteStops)
}));

export const transportRouteStopsRelations = relations(transportRouteStops, ({ one }) => ({
  route: one(transportRoutes, { fields: [transportRouteStops.routeId], references: [transportRoutes.id] })
}));
