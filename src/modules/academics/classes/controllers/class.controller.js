import { createCrudController } from "../../../../common/crud/crudController.js";
import { ok } from "../../../../common/http/responses.js";
import { classService } from "../services/class.service.js";

const crud = createCrudController(classService, {
  singular: "Class",
  plural: "Classes",
  idParam: "classId",
  bulkKey: "classes"
});

export const classController = {
  ...crud,

  levels: async (req, res) => ok(res, await classService.levels(req.context), "Class levels retrieved successfully")
};
