import { createCrudController } from "../../../../common/crud/crudController.js";
import { ok } from "../../../../common/http/responses.js";
import { timetableService } from "../services/timetable.service.js";

const crud = createCrudController(timetableService, {
  singular: "Timetable slot",
  plural: "Timetable slots",
  idParam: "slotId"
});

export const timetableController = {
  create: crud.create,
  update: crud.update,
  remove: crud.remove,

  forSection: async (req, res) =>
    ok(
      res,
      await timetableService.forSection(req.context, req.params.sectionId),
      "Section timetable retrieved successfully"
    ),

  forTeacher: async (req, res) =>
    ok(
      res,
      await timetableService.forTeacher(req.context, req.params.teacherId, req.context.academicYear),
      "Teacher timetable retrieved successfully"
    )
};
