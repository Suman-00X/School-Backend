import { ok, paginated } from "../../../../common/http/responses.js";
import { studentLeaveService } from "../services/studentLeave.service.js";

const excusedText = n => (n ? `; ${n} absence mark${n === 1 ? "" : "s"} changed to excused` : "");

export const studentLeaveController = {
  list: async (req, res) =>
    paginated(res, await studentLeaveService.list(req.context, req.query), "Leave requests retrieved successfully"),

  onLeave: async (req, res) =>
    ok(res, await studentLeaveService.onLeave(req.context, req.query), "Students on leave retrieved successfully"),

  getById: async (req, res) =>
    ok(
      res,
      await studentLeaveService.getById(req.context, req.params.requestId),
      "Leave request retrieved successfully"
    ),

  decide: async (req, res) => {
    const { leave, excusedMarks } = await studentLeaveService.decide(req.context, req.params.requestId, req.body);
    return ok(
      res,
      { ...leave, excusedMarks },
      leave.status === "APPROVED"
        ? `Leave approved${excusedText(excusedMarks)}`
        : "Leave rejected; the family will be told why"
    );
  }
};
