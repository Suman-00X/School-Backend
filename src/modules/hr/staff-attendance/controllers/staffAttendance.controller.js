import { created, ok } from "../../../../common/http/responses.js";
import { staffAttendanceService } from "../services/staffAttendance.service.js";

export const staffAttendanceController = {
  /* 201 when any mark is new, 200 when every mark was already there and is updated */
  record: async (req, res) => {
    const result = await staffAttendanceService.record(req.context, req.body);
    const parts = [result.created && `${result.created} recorded`, result.updated && `${result.updated} updated`];
    const message = `Staff attendance for ${result.date}: ${parts.filter(Boolean).join(", ")}`;
    return result.created ? created(res, result, message) : ok(res, result, message);
  },

  register: async (req, res) => {
    const register = await staffAttendanceService.register(req.context, req.query);
    return ok(
      res,
      register,
      `Staff register for ${register.date}: ${register.summary.marked} of ${register.summary.employees} marked`
    );
  },

  summary: async (req, res) =>
    ok(res, await staffAttendanceService.summary(req.context, req.query), "Staff attendance summary retrieved"),

  mine: async (req, res) =>
    ok(res, await staffAttendanceService.mine(req.context, req.query), "Your attendance retrieved successfully")
};
