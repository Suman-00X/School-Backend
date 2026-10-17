import { created, ok, paginated } from "../../../../common/http/responses.js";
import { libraryClosureService } from "../services/libraryClosure.service.js";

const span = c => (c.fromDate === c.toDate ? c.fromDate : `${c.fromDate} to ${c.toDate}`);

export const libraryClosureController = {
  list: async (req, res) =>
    paginated(res, await libraryClosureService.list(req.context, req.query), "Library closures retrieved successfully"),

  create: async (req, res) => {
    const closure = await libraryClosureService.create(req.context, req.body);
    return created(
      res,
      closure,
      `Library closed ${span(closure)} (${closure.reason}). Late fines skip these days and due dates move past them`
    );
  },

  remove: async (req, res) => {
    const closure = await libraryClosureService.remove(req.context, req.params.closureId);
    return ok(res, closure, `Library closure ${span(closure)} removed. Fines already recorded stay as they are`);
  }
};
