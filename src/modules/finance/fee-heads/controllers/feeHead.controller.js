import { createCrudController } from "../../../../common/crud/crudController.js";
import { feeHeadService } from "../services/feeHead.service.js";

export const feeHeadController = createCrudController(feeHeadService, {
  singular: "Fee head",
  plural: "Fee heads",
  idParam: "feeHeadId"
});
