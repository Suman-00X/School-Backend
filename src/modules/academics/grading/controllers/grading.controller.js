import { createCrudController } from "../../../../common/crud/crudController.js";
import { gradingService } from "../services/grading.service.js";

export const gradingController = createCrudController(gradingService, {
  singular: "Grade scale",
  plural: "Grade scales",
  idParam: "gradeScaleId"
});
