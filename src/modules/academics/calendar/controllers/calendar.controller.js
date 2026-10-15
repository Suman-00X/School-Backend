import { createCrudController } from "../../../../common/crud/crudController.js";
import { ok } from "../../../../common/http/responses.js";
import { calendarService } from "../services/calendar.service.js";

const crud = createCrudController(calendarService, {
  singular: "Calendar event",
  plural: "Calendar events",
  idParam: "eventId"
});

export const calendarController = {
  ...crud,

  workingDays: async (req, res) => {
    const result = await calendarService.workingDays(
      req.context,
      req.context.academicYear,
      req.query.from,
      req.query.to
    );
    return ok(
      res,
      { ...result, count: result.workingDays.length },
      `${result.workingDays.length} working day(s) between ${result.from} and ${result.to}`
    );
  }
};
