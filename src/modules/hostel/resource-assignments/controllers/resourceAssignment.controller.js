import { created, ok, paginated } from "../../../../common/http/responses.js";
import { describeRange } from "../../shared/utils/dateRange.util.js";
import { fullName, resourceLabel } from "../../shared/utils/hostel.util.js";
import { resourceAssignmentService as service } from "../services/resourceAssignment.service.js";

const studentName = assignment => fullName(assignment.student.user);

export const resourceAssignmentController = {
  create: async (req, res) => {
    const assignment = await service.create(req.context, req.body);
    return created(
      res,
      assignment,
      `${resourceLabel(assignment.resource)} assigned to ${studentName(assignment)} ${describeRange(assignment)}` +
        (assignment.allocationId ? ", with their bed" : "")
    );
  },

  list: async (req, res) =>
    paginated(res, await service.list(req.context, req.query), "Resource assignments retrieved successfully"),

  getById: async (req, res) =>
    ok(res, await service.getById(req.context, req.params.assignmentId), "Resource assignment retrieved successfully"),

  update: async (req, res) => {
    const assignment = await service.update(req.context, req.params.assignmentId, req.body);
    return ok(
      res,
      assignment,
      `${studentName(assignment)} holds ${resourceLabel(assignment.resource)} ${describeRange(assignment)}`
    );
  },

  release: async (req, res) => {
    const assignment = await service.release(req.context, req.params.assignmentId, req.body);
    return ok(
      res,
      assignment,
      `${studentName(assignment)} released ${resourceLabel(assignment.resource)} on ${assignment.toDate}`
    );
  },

  cancel: async (req, res) => {
    const assignment = await service.cancel(req.context, req.params.assignmentId, req.body);
    return ok(
      res,
      assignment,
      `${resourceLabel(assignment.resource)} for ${studentName(assignment)} ${describeRange(assignment)} cancelled`
    );
  }
};
