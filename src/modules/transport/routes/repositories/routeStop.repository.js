import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { transportRouteStops as stops } from "../models/route.schema.js";

/* Kept stops are parked here while a stop list is rewritten, so swapping two
   stops' sequences or names never trips the unique indexes mid-way */
const PARK_OFFSET = 100_000;

export const routeStopRepository = {
  ...createRepository({ table: stops, queryKey: "transportRouteStops", orderBy: asc(stops.sequence) }),

  insertForRoute: (tenantId, routeId, items, { dbc = db } = {}) =>
    items.length
      ? dbc
          .insert(stops)
          .values(items.map(item => ({ ...item, routeId, tenantId })))
          .returning()
      : [],

  /* Rewrite a route's stop list: soft-delete `removeIds`, update `keep` (rows with id), insert `add` */
  replaceForRoute: async (tenantId, routeId, { keep, add, removeIds }, { dbc }) => {
    const inRoute = (...conditions) => and(eq(stops.tenantId, tenantId), eq(stops.routeId, routeId), ...conditions);
    if (removeIds.length) {
      await dbc
        .update(stops)
        .set({ isActive: false })
        .where(inRoute(inArray(stops.id, removeIds)));
    }
    if (keep.length) {
      await dbc
        .update(stops)
        .set({ sequence: sql`${stops.sequence} + ${PARK_OFFSET}`, name: sql`${stops.id}::text` })
        .where(
          inRoute(
            inArray(
              stops.id,
              keep.map(stop => stop.id)
            )
          )
        );
      for (const { id, ...values } of keep) {
        await dbc
          .update(stops)
          .set(values)
          .where(inRoute(eq(stops.id, id)));
      }
    }
    await routeStopRepository.insertForRoute(tenantId, routeId, add, { dbc });
  }
};
