import { created, ok } from "../../../../common/http/responses.js";
import { attendanceService } from "../services/attendance.service.js";

export const attendanceController = {
  /* 201 for a new register, 200 when an existing one was retaken */
  record: async (req, res) => {
    const result = await attendanceService.record(req.context, req.body);
    const message = `Attendance ${result.created ? "recorded" : "updated"} for ${result.summary.marked} student(s)`;
    return result.created ? created(res, result, message) : ok(res, result, message);
  },

  register: async (req, res) =>
    ok(res, await attendanceService.register(req.context, req.query), "Attendance register retrieved successfully"),

  summary: async (req, res) =>
    ok(
      res,
      await attendanceService.sectionSummary(req.context, req.query),
      "Attendance summary retrieved successfully"
    ),

  student: async (req, res) =>
    ok(
      res,
      await attendanceService.studentAttendance(req.context, req.params.studentId, req.query),
      "Student attendance retrieved successfully"
    )
};
