import { ROLES } from "../../../../common/auth/roles.js";
import { notFound } from "../../../../common/http/errors.js";
import { parentService } from "../../../users/parents/index.js";
import { studentParentService, studentService } from "../../../users/students/index.js";

/* Which students the signed-in person may see in the portal:
   a student sees themselves; a parent sees the children linked to them. */
export const studentAccess = {
  visibleStudentIds: async ctx => {
    if (ctx.visibleStudentIds) return ctx.visibleStudentIds;
    let ids = [];
    if (ctx.role === ROLES.STUDENT) {
      const student = await studentService.findByUserId(ctx, ctx.userId);
      ids = student ? [student.id] : [];
    } else if (ctx.role === ROLES.PARENT) {
      const parent = await parentService.findByUserId(ctx, ctx.userId);
      ids = parent ? (await studentParentService.childrenOf(ctx, parent.id)).map(link => link.studentId) : [];
    }
    ctx.visibleStudentIds = ids;
    return ids;
  },

  /* 404 rather than 403, so other students' ids are not confirmed to exist */
  assert: async (ctx, studentId) => {
    if (!(await studentAccess.visibleStudentIds(ctx)).includes(studentId)) throw notFound("Student");
  }
};
