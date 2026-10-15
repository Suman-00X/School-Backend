import { createCrudController } from "../../../../common/crud/crudController.js";
import { ok } from "../../../../common/http/responses.js";
import { academicYearService } from "../services/academicYear.service.js";

const crud = createCrudController(academicYearService, {
  singular: "Academic year",
  plural: "Academic years",
  idParam: "academicYearId"
});

export const academicYearController = {
  ...crud,

  getCurrent: async (req, res) =>
    ok(res, await academicYearService.getCurrent(req.context), "Current academic year retrieved successfully")
};
