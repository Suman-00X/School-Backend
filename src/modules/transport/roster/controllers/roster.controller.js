import { sendTable } from "../../../../common/export/exporters.js";
import { ok } from "../../../../common/http/responses.js";
import { routeLabel } from "../../shared/utils/format.util.js";
import { rosterService } from "../services/roster.service.js";

export const rosterController = {
  /* JSON by default; ?format=csv|xlsx downloads it for the driver/attendant */
  forRoute: async (req, res) => {
    if (req.query.format) {
      const table = await rosterService.table(req.context, req.params.routeId);
      return sendTable(res, { ...table, format: req.query.format });
    }
    const roster = await rosterService.forRoute(req.context, req.params.routeId);
    return ok(
      res,
      roster,
      `${routeLabel(roster.route)} roster: ${roster.occupancy.assigned} student(s) across ${roster.stops.length} stop(s)`
    );
  }
};
