import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { and, asc, eq } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { transportVehicles as vehicles } from "../models/vehicle.schema.js";

export const vehicleRepository = {
  ...createRepository({ table: vehicles, queryKey: "transportVehicles", orderBy: asc(vehicles.registrationNumber) }),

  /* Lock a vehicle for the rest of the transaction (capacity and status changes) */
  lockForUpdate: async (tenantId, vehicleId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.tenantId, tenantId), eq(vehicles.id, vehicleId), eq(vehicles.isActive, true)))
      .for("update");
    return row ?? null;
  }
};

describeDuplicates({
  transport_vehicles_tenant_registration_uq: ({ registrationNumber }) =>
    `A vehicle with registration number ${registrationNumber} already exists`
});
