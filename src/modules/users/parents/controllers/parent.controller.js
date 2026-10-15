import { createCrudController } from "../../../../common/crud/crudController.js";
import { parentService } from "../services/parent.service.js";

export const parentController = createCrudController(parentService, {
  singular: "Parent",
  plural: "Parents",
  idParam: "parentId"
});
