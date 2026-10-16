import { createCrudController } from "../../../../common/crud/crudController.js";
import { created, ok } from "../../../../common/http/responses.js";
import { gradingService } from "../services/grading.service.js";

const crud = createCrudController(gradingService, {
  singular: "Grade scale",
  plural: "Grade scales",
  idParam: "gradeScaleId"
});

export const gradingController = {
  ...crud,

  create: async (req, res) => {
    const scale = await gradingService.create(req.context, req.body);
    return created(res, scale, `Grade scale ${scale.name} created with ${scale.bands.length} bands`);
  },

  templates: async (req, res) => ok(res, gradingService.templates(), "Grade scale templates retrieved successfully")
};
