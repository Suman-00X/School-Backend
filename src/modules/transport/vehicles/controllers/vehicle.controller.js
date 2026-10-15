import { created, done, ok, paginated } from "../../../../common/http/responses.js";
import { vehicleService } from "../services/vehicle.service.js";

export const vehicleController = {
  create: async (req, res) => {
    const vehicle = await vehicleService.create(req.context, req.body);
    return created(res, vehicle, `Vehicle ${vehicle.registrationNumber} added (${vehicle.capacity} seats)`);
  },

  list: async (req, res) => {
    const result = await vehicleService.list(req.context, req.query);
    const message =
      req.query.expiringWithinDays === undefined
        ? "Vehicles retrieved successfully"
        : `${result.meta.total} vehicle(s) with documents expiring within ${req.query.expiringWithinDays} days`;
    return paginated(res, result, message);
  },

  getById: async (req, res) =>
    ok(res, await vehicleService.getById(req.context, req.params.vehicleId), "Vehicle retrieved successfully"),

  update: async (req, res) => {
    const vehicle = await vehicleService.update(req.context, req.params.vehicleId, req.body);
    return ok(res, vehicle, `Vehicle ${vehicle.registrationNumber} updated`);
  },

  remove: async (req, res) => {
    const vehicle = await vehicleService.remove(req.context, req.params.vehicleId);
    return done(res, `Vehicle ${vehicle.registrationNumber} removed`);
  }
};
