import { createCrudController } from "../../../../common/crud/crudController.js";
import { teacherAssignmentService } from "../services/teacherAssignment.service.js";

const crud = createCrudController(teacherAssignmentService, {
  singular: "Teacher assignment",
  plural: "Teacher assignments",
  idParam: "assignmentId"
});

export const teacherAssignmentController = {
  create: crud.create,
  list: crud.list,
  remove: crud.remove
};
