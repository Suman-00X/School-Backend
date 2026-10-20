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
  remove: async (req, res) => {
    const outcome = await timetableService.remove(req.context, req.params.slotId);
    const { substitutionsCancelled: cancelled } = outcome;
    const plans = cancelled ? ` (${cancelled} substitution plan${cancelled === 1 ? "" : "s"} cancelled)` : "";
    return ok(res, outcome, `Timetable slot removed successfully${plans}`);
  },

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
