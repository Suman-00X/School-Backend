import { created, ok } from "../../../../common/http/responses.js";
import { MODE_TEXT } from "../services/attendanceMode.service.js";
import { attendancePolicyService, attendanceService } from "../services/attendance.service.js";
import { missingRegisterService } from "../services/missingRegisters.service.js";

const windowText = policy =>
  policy.editWindowDays === 0 ? "the same day" : `${policy.editWindowDays} day(s) after the date`;

/* "from 2026-10-18 the school takes attendance period by period; Class 5 twice a day (forenoon and afternoon)" */
const changeText = change => {
  const parts = [
    change.mode && `the school takes attendance ${MODE_TEXT[change.mode]}`,
    ...change.classModes.map(c =>
      c.mode ? `${c.className} ${MODE_TEXT[c.mode]}` : `${c.className} follows the school`
    )
  ].filter(Boolean);
  return `from ${change.effectiveFrom} ${parts.join("; ")}`;
};

export const attendanceController = {
  getPolicy: async (req, res) => {
    const policy = await attendancePolicyService.get(req.context);
    return ok(
      res,
      policy,
      `Registers can be changed until ${windowText(policy)}. Attendance is taken ${MODE_TEXT[policy.mode]}.`
    );
  },

  updatePolicy: async (req, res) => {
    const policy = await attendancePolicyService.update(req.context, req.body);
    const change = policy.change ? `; ${changeText(policy.change)}` : "";
    return ok(res, policy, `Attendance policy updated: registers lock after ${windowText(policy)}${change}`);
  },

  /* 201 for a new register, 200 when an existing one was retaken */
  record: async (req, res) => {
    const result = await attendanceService.record(req.context, req.body);
    const which = result.session.kind === "DAY" ? "Attendance" : `${result.session.label} attendance`;
    const message = `${which} ${result.created ? "recorded" : "updated"} for ${result.summary.marked} student(s)${
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

  missingRegisters: async (req, res) => {
    const result = await missingRegisterService.list(req.context, req.query);
    const message = result.total
      ? `${result.total} register(s) not taken from ${result.from} to ${result.to}`
      : `Every expected register was taken from ${result.from} to ${result.to}`;
    return ok(res, result, message);
  },

  student: async (req, res) =>
    ok(
      res,
      await attendanceService.studentAttendance(req.context, req.params.studentId, req.query),
      "Student attendance retrieved successfully"
    )
};
