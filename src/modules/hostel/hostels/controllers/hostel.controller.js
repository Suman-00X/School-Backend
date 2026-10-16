import { createCrudController } from "../../../../common/crud/crudController.js";
import { created, done, ok } from "../../../../common/http/responses.js";
import { hostelService } from "../services/hostel.service.js";

export const hostelController = {
  ...createCrudController(hostelService, { singular: "Hostel", plural: "Hostels", idParam: "hostelId" }),

  create: async (req, res) => {
    const hostel = await hostelService.create(req.context, req.body);
    return created(res, hostel, `Hostel ${hostel.name} (${hostel.code}) created`);
  },

  remove: async (req, res) => {
    const hostel = await hostelService.remove(req.context, req.params.hostelId);
    return done(res, `Hostel ${hostel.name} and its rooms removed`);
  },

  occupancy: async (req, res) => {
    const result = await hostelService.occupancy(req.context, req.params.hostelId, req.query);
    const { occupied, capacity } = result.totals;
    return ok(res, result, `${result.hostel.name}: ${occupied} of ${capacity} beds occupied on ${result.on}`);
  }
};
