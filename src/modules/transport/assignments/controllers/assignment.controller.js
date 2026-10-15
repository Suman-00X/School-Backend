import { created, ok, paginated } from "../../../../common/http/responses.js";
import { fullName, hhmm, routeLabel } from "../../shared/utils/format.util.js";
import { assignmentService } from "../services/assignment.service.js";

/* "Asha Rao: Route R1, stop Market Road (pickup 07:30)" */
const describe = assignment => {
  const pickup = hhmm(assignment.stop.pickupTime);
  return `${fullName(assignment.student.user)}: ${routeLabel(assignment.route)}, stop ${assignment.stop.name}${pickup ? ` (pickup ${pickup})` : ""}`;
};

export const assignmentController = {
  create: async (req, res) => {
    const assignment = await assignmentService.create(req.context, req.body);
    return created(res, assignment, `Transport assigned. ${describe(assignment)}`);
  },

  list: async (req, res) =>
    paginated(
      res,
      await assignmentService.list(req.context, req.query),
      "Transport assignments retrieved successfully"
    ),

  getById: async (req, res) =>
    ok(
      res,
      await assignmentService.getById(req.context, req.params.assignmentId),
      "Transport assignment retrieved successfully"
    ),

  end: async (req, res) => {
    const assignment = await assignmentService.end(req.context, req.params.assignmentId, req.body);
    return ok(
      res,
      assignment,
      `Transport ended for ${fullName(assignment.student.user)}. Last day ${assignment.endDate}`
    );
  },

  change: async (req, res) => {
    const assignment = await assignmentService.change(req.context, req.params.assignmentId, req.body);
    return created(res, assignment, `Transport changed from ${assignment.startDate}. ${describe(assignment)}`);
  }
};
