import { createCrudController } from "../../../../common/crud/crudController.js";
import { lateFeeRuleService } from "../services/lateFeeRule.service.js";

export const lateFeeRuleController = createCrudController(lateFeeRuleService, {
  singular: "Late fee rule",
  plural: "Late fee rules",
  idParam: "lateFeeRuleId"
});
