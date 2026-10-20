import { diaryService } from "../../../academics/diary/index.js";
import { studentAccess } from "../../shared/services/studentAccess.service.js";

export const portalDiaryService = {
  days: async (ctx, studentId, range) => {
    await studentAccess.assert(ctx, studentId);
    return diaryService.daysForStudent(ctx, studentId, range);
  },

  day: async (ctx, studentId, date) => {
    await studentAccess.assert(ctx, studentId);
    return diaryService.dayForStudent(ctx, studentId, date);
  },

  sign: async (ctx, studentId, body) => {
    await studentAccess.assert(ctx, studentId);
    return diaryService.sign(ctx, studentId, body);
  }
};
