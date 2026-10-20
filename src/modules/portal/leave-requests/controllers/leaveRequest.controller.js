import { created, ok, paginated } from "../../../../common/http/responses.js";
import { portalLeaveService } from "../services/leaveRequest.service.js";

export const portalLeaveController = {
  list: async (req, res) =>
    paginated(
      res,
      await portalLeaveService.list(req.context, req.params.studentId, req.query),
      "Leave requests retrieved successfully"
    ),

  apply: async (req, res) =>
    created(
      res,
      await portalLeaveService.apply(req.context, req.params.studentId, req.body),
      "Leave applied; the class teacher will review it"
    ),

  cancel: async (req, res) =>
    ok(
      res,
      await portalLeaveService.cancel(req.context, req.params.studentId, req.params.requestId, req.body),
      "Leave request cancelled"
    )
};
