import { ok } from "../../../../common/http/responses.js";
import { portalDiaryService } from "../services/diary.service.js";

export const portalDiaryController = {
  days: async (req, res) =>
    ok(res, await portalDiaryService.days(req.context, req.params.studentId, req.query), "Diary days retrieved successfully"),

  day: async (req, res) =>
    ok(res, await portalDiaryService.day(req.context, req.params.studentId, req.query.date), "Diary retrieved successfully"),

  sign: async (req, res) => {
    const { signature, again } = await portalDiaryService.sign(req.context, req.params.studentId, req.body);
    return ok(res, signature, again ? "Diary signed again" : "Diary signed; thank you");
  }
};
