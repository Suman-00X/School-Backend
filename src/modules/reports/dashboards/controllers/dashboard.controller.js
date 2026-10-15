import { ok } from "../../../../common/http/responses.js";
import { dashboardService } from "../services/dashboard.service.js";

export const dashboardController = {
  overview: async (req, res) =>
    ok(res, await dashboardService.overview(req.context), "Overview retrieved successfully"),
  attendance: async (req, res) =>
    ok(res, await dashboardService.attendance(req.context, req.query), "Attendance report retrieved successfully"),
  fees: async (req, res) =>
    ok(res, await dashboardService.fees(req.context, req.query), "Fee report retrieved successfully"),
  academics: async (req, res) =>
    ok(res, await dashboardService.academics(req.context, req.query), "Result analysis retrieved successfully")
};
