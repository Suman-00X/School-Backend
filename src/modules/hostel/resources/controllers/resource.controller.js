import { createCrudController } from "../../../../common/crud/crudController.js";
import { created, done } from "../../../../common/http/responses.js";
import { resourceLabel } from "../../shared/utils/hostel.util.js";
import { resourceService } from "../services/resource.service.js";

/* "Room 101, Boys Hostel" or "Boys Hostel" */
const place = resource => (resource.room ? `Room ${resource.room.roomNumber}, ` : "") + resource.hostel.name;

export const resourceController = {
  ...createCrudController(resourceService, { singular: "Resource", plural: "Resources", idParam: "resourceId" }),

  create: async (req, res) => {
    const resource = await resourceService.create(req.context, req.body);
    return created(
      res,
      resource,
      `${resourceLabel(resource)} added to ${place(resource)} for ${resource.capacity} student(s)`
    );
  },

  remove: async (req, res) => {
    const resource = await resourceService.remove(req.context, req.params.resourceId);
    return done(res, `${resourceLabel(resource)} removed`);
  }
};
