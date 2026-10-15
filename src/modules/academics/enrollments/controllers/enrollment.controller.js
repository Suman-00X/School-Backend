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

  promoteSection: async (req, res) => {
    const result = await enrollmentService.promoteSection(req.context, req.body);
    return created(
      res,
      result,
      `Section promoted: ${result.promoted} promoted, ${result.repeated} repeating, ${result.left} left, ${result.skipped.length} skipped`
    );
  },

  promote: async (req, res) =>
    created(res, await enrollmentService.promote(req.context, req.body), "Student promoted successfully")
};
