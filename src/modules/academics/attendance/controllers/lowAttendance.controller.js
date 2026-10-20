import { ok } from "../../../../common/http/responses.js";
import { lowAttendanceService } from "../services/lowAttendance.service.js";

export const lowAttendanceController = {
  list: async (req, res) => {
    const result = await lowAttendanceService.list(req.context, req.query);
    const message = result.total
      ? `${result.total} student(s) are below ${result.threshold}% attendance this year`
      : `No student is below ${result.threshold}% attendance this year`;
    return ok(res, result, message);
  }
};
