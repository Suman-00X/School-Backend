import { ok, paginated } from "../../../../common/http/responses.js";
import { learningService } from "../services/learning.service.js";

export const learningController = {
  students: async (req, res) => ok(res, await learningService.students(req.context), "Students retrieved successfully"),

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

  calendar: async (req, res) =>
    paginated(res, await learningService.calendar(req.context, req.query), "Calendar retrieved successfully"),

  teacherTimetable: async (req, res) =>
    ok(res, await learningService.teacherTimetable(req.context), "Timetable retrieved successfully"),

  teacherSections: async (req, res) =>
    ok(res, await learningService.teacherSections(req.context), "Sections retrieved successfully")
};
