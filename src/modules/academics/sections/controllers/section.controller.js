import { createCrudController } from "../../../../common/crud/crudController.js";
import { sectionService } from "../services/section.service.js";

export const sectionController = createCrudController(sectionService, {
  singular: "Section",
  plural: "Sections",
  idParam: "sectionId",
  bulkKey: "sections"
});
