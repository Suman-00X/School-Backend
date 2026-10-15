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
    ok(res, await academicYearService.getCurrent(req.context), "Current academic year retrieved successfully"),

  archive: async (req, res) => {
    const year = await academicYearService.archive(req.context, req.params.academicYearId);
    return ok(res, year, `Academic year ${year.yearName} archived. Its records are now read-only.`);
  },

  restore: async (req, res) => {
    const year = await academicYearService.restore(req.context, req.params.academicYearId);
    return ok(res, year, `Academic year ${year.yearName} restored and editable again`);
  }
};
