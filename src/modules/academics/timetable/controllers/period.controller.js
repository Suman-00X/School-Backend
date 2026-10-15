import { createCrudController } from "../../../../common/crud/crudController.js";
import { periodService } from "../services/period.service.js";

export const periodController = createCrudController(periodService, {
  singular: "Period",
  plural: "Periods",
  idParam: "periodId"
});
