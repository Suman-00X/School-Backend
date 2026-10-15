import { createCrudController } from "../../../../common/crud/crudController.js";
import { feeStructureService } from "../services/feeStructure.service.js";

export const feeStructureController = createCrudController(feeStructureService, {
  singular: "Fee structure",
  plural: "Fee structures",
  idParam: "feeStructureId"
});
