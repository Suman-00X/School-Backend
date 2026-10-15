import { forbidden } from "../../../../common/http/errors.js";
import { studentService } from "../../../users/students/index.js";
import { homeworkService } from "../../../academics/homework/index.js";
import { studentAccess } from "../../shared/services/studentAccess.service.js";

export const portalHomeworkService = {
  list: async (ctx, studentId, query) => {
    await studentAccess.assert(ctx, studentId);
    return homeworkService.forStudent(ctx, studentId, query);
  },

  detail: async (ctx, studentId, homeworkId) => {
    await studentAccess.assert(ctx, studentId);
    return homeworkService.detailForStudent(ctx, studentId, homeworkId);
  },

  attachmentUrl: async (ctx, studentId, homeworkId, fileId) => {
    await studentAccess.assert(ctx, studentId);
    return homeworkService.attachmentUrlForStudent(ctx, studentId, homeworkId, fileId);
  },

  /* Only the student themselves submits (parents can watch, not submit) */
  submit: async (ctx, homeworkId, body, file) => {
    const student = await studentService.findByUserId(ctx, ctx.userId);
    if (!student) throw forbidden("Only students can submit homework");
    return homeworkService.submit(ctx, student.id, homeworkId, body, file);
  }
};
