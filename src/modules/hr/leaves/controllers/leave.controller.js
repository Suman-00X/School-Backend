import { createCrudController } from "../../../../common/crud/crudController.js";
import { created, ok, paginated } from "../../../../common/http/responses.js";
import { leaveRequestService } from "../services/leaveRequest.service.js";
import { leaveTypeService } from "../services/leaveType.service.js";

const span = request =>
  request.fromDate === request.toDate ? request.fromDate : `${request.fromDate} to ${request.toDate}`;
const dayWord = days => `${days} day${days === 1 ? "" : "s"}`;
const describe = request => `${request.leaveType?.name ?? "Leave"}, ${span(request)} (${dayWord(request.days)})`;

export const leaveTypeController = createCrudController(leaveTypeService, {
  singular: "Leave type",
  plural: "Leave types",
  idParam: "leaveTypeId"
});

export const leaveRequestController = {
  apply: async (req, res) => {
    const request = await leaveRequestService.apply(req.context, req.body);
    const outcome = request.status === "APPROVED" ? "approved" : "submitted for approval";
    return created(res, request, `Leave request ${outcome}: ${describe(request)}`);
  },

  decide: async (req, res) => {
    const request = await leaveRequestService.decide(req.context, req.params.requestId, req.body);
    const marked = request.markedDates.length ? `; ${dayWord(request.markedDates.length)} marked on the register` : "";
    return ok(res, request, `Leave request ${request.status.toLowerCase()}: ${describe(request)}${marked}`);
  },

  cancel: async (req, res) => {
    const request = await leaveRequestService.cancel(req.context, req.params.requestId, req.body);
    return ok(res, request, `Leave request cancelled: ${describe(request)}`);
  },

  list: async (req, res) =>
    paginated(res, await leaveRequestService.list(req.context, req.query), "Leave requests retrieved successfully"),

  mine: async (req, res) =>
    paginated(
      res,
      await leaveRequestService.mine(req.context, req.query),
      "Your leave requests retrieved successfully"
    ),

  getById: async (req, res) =>
    ok(
      res,
      await leaveRequestService.getById(req.context, req.params.requestId),
      "Leave request retrieved successfully"
    )
};

export const leaveBalanceController = {
  list: async (req, res) =>
    ok(res, await leaveRequestService.balances(req.context, req.query), "Leave balances retrieved successfully"),

  mine: async (req, res) =>
    ok(
      res,
      await leaveRequestService.balances(req.context, { year: req.query.year }),
      "Your leave balances retrieved successfully"
    )
};
