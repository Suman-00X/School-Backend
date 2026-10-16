import { created, ok } from "../../../../common/http/responses.js";
import { attendancePolicyService, attendanceService } from "../services/attendance.service.js";

const windowText = policy =>
  policy.editWindowDays === 0 ? "the same day" : `${policy.editWindowDays} day(s) after the date`;

export const attendanceController = {
  getPolicy: async (req, res) => {
    const policy = await attendancePolicyService.get(req.context);
    return ok(res, policy, `Registers can be changed until ${windowText(policy)}`);
  },

  updatePolicy: async (req, res) => {
    const policy = await attendancePolicyService.update(req.context, req.body);
    return ok(res, policy, `Attendance policy updated: registers lock after ${windowText(policy)}`);
  },

  /* 201 for a new register, 200 when an existing one was retaken */
  record: async (req, res) => {
    const result = await attendanceService.record(req.context, req.body);
    const message = `Attendance ${result.created ? "recorded" : "updated"} for ${result.summary.marked} student(s)${
      result.overridden ? " (locked register changed by override)" : ""
    }`;
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
