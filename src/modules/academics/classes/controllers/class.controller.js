import { createCrudController } from "../../../../common/crud/crudController.js";
import { classService } from "../services/class.service.js";

export const classController = createCrudController(classService, {
  singular: "Class",
  plural: "Classes",
  idParam: "classId",
  bulkKey: "classes"
});
