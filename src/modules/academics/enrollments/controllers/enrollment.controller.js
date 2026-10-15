import { createCrudController } from "../../../../common/crud/crudController.js";
import { created } from "../../../../common/http/responses.js";
import { enrollmentService } from "../services/enrollment.service.js";

const crud = createCrudController(enrollmentService, {
  singular: "Enrollment",
  plural: "Enrollments",
  idParam: "enrollmentId"
});

export const enrollmentController = {
  list: crud.list,
  update: crud.update,

  create: async (req, res) =>
    created(res, await enrollmentService.create(req.context, req.body), "Student enrolled successfully"),

  promote: async (req, res) =>
    created(res, await enrollmentService.promote(req.context, req.body), "Student promoted successfully")
};
