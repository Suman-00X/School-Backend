import { created, done, ok } from "../../../../common/http/responses.js";
import { diaryService } from "../services/diary.service.js";

export const diaryController = {
  create: async (req, res) => created(res, await diaryService.create(req.context, req.body), "Written in the diary"),

  update: async (req, res) =>
    ok(res, await diaryService.update(req.context, req.params.entryId, req.body), "Diary line updated"),

  remove: async (req, res) => {
    await diaryService.remove(req.context, req.params.entryId);
    return done(res, "Diary line removed");
  },

  days: async (req, res) =>
    ok(res, await diaryService.days(req.context, req.params.sectionId, req.query), "Diary days retrieved successfully"),

  day: async (req, res) =>
    ok(res, await diaryService.day(req.context, req.params.sectionId, req.query.date), "Diary retrieved successfully"),

  signatures: async (req, res) =>
    ok(
      res,
      await diaryService.signatures(req.context, req.params.sectionId, req.query.date),
      "Diary signatures retrieved successfully"
    )
};
