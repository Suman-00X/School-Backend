import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { asc, eq } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { transportRoutes as routes } from "../models/route.schema.js";

export const routeRepository = {
  ...createRepository({ table: routes, queryKey: "transportRoutes", orderBy: asc(routes.name) }),

  /* Lock a route for the rest of the transaction: every change to its seats,
     stops or vehicle goes through this lock */
  lockForUpdate: async (tenantId, routeId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(routes)
      .where(scoped(routes, tenantId, eq(routes.id, routeId)))
      .for("update");
    return row ?? null;
  },

  lockByVehicle: async (tenantId, vehicleId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(routes)
      .where(scoped(routes, tenantId, eq(routes.vehicleId, vehicleId)))
      .for("update");
    return row ?? null;
  }
};

describeDuplicates({
  transport_routes_tenant_name_uq: ({ name }) => `A route named ${name} already exists`,
  transport_routes_tenant_code_uq: ({ code }) => `A route with code ${code} already exists`,
  transport_route_stops_route_name_uq: ({ name }) => `The route already has a stop named ${name}`
});
