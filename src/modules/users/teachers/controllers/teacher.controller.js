import { createCrudController } from "../../../../common/crud/crudController.js";
import { teacherService } from "../services/teacher.service.js";

export const teacherController = createCrudController(teacherService, {
  singular: "Teacher",
  plural: "Teachers",
  idParam: "teacherId"
});
