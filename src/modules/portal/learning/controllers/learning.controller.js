import { sendFile } from "../../../../common/export/exporters.js";
import { ok, paginated } from "../../../../common/http/responses.js";
import { learningService } from "../services/learning.service.js";

export const learningController = {
  students: async (req, res) => ok(res, await learningService.students(req.context), "Students retrieved successfully"),

  attendanceAlerts: async (req, res) => {
    const result = await learningService.attendanceAlerts(req.context);
    const message = result.students.length
      ? `${result.students.length} student(s) below ${result.threshold}% attendance this year`
      : `Attendance is at or above ${result.threshold}% this year`;
    return ok(res, result, message);
  },

  timetable: async (req, res) =>
    ok(res, await learningService.timetable(req.context, req.params.studentId), "Timetable retrieved successfully"),

  attendance: async (req, res) =>
    ok(
      res,
      await learningService.attendance(req.context, req.params.studentId, req.query),
      "Attendance retrieved successfully"
    ),

  reportCards: async (req, res) =>
    ok(
      res,
      await learningService.reportCards(req.context, req.params.studentId, req.query),
      "Report cards retrieved successfully"
    ),

  reportCardPdf: async (req, res) => {
    const { buffer, fileName } = await learningService.reportCardPdf(req.context, req.params.studentId, req.query);
    return sendFile(res, { buffer, fileName, format: "pdf" });
  },

  admitCards: async (req, res) =>
    ok(res, await learningService.admitCards(req.context, req.params.studentId), "Admit cards retrieved successfully"),

  admitCardPdf: async (req, res) => {
    const { buffer, fileName } = await learningService.admitCardPdf(
      req.context,
      req.params.studentId,
      req.params.admitCardId
    );
    return sendFile(res, { buffer, fileName, format: "pdf" });
  },

  calendar: async (req, res) =>
    paginated(res, await learningService.calendar(req.context, req.query), "Calendar retrieved successfully"),

  teacherTimetable: async (req, res) =>
    ok(res, await learningService.teacherTimetable(req.context), "Timetable retrieved successfully"),

  teacherSections: async (req, res) =>
    ok(res, await learningService.teacherSections(req.context), "Sections retrieved successfully")
};
