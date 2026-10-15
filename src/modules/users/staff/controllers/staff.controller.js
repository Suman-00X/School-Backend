import { createCrudController } from "../../../../common/crud/crudController.js";
import { staffService } from "../services/staff.service.js";

export const staffController = createCrudController(staffService, {
  singular: "Staff member",
  plural: "Staff members",
  idParam: "staffId"
});
