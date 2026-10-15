import { created, ok, paginated } from "../../../../common/http/responses.js";
import { marksService } from "../services/marks.service.js";

export const marksController = {
  /* 201 when new, 200 when an existing entry was updated */
  record: async (req, res) => {
    const result = await marksService.record(req.context, req.body);
    return result.created
      ? created(res, result.marks, "Marks recorded successfully")
      : ok(res, result.marks, "Marks updated successfully");
  },

  recordMany: async (req, res) => {
    const summary = await marksService.recordMany(req.context, req.body.marks);
    return ok(res, summary, `Marks saved: ${summary.created} recorded, ${summary.updated} updated`);
  },

  list: async (req, res) =>
    paginated(res, await marksService.list(req.context, req.query), "Marks retrieved successfully")
};
