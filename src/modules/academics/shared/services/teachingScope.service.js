import { ROLES } from "../../../../common/auth/roles.js";
import { forbidden } from "../../../../common/http/errors.js";
import { teacherService } from "../../../users/teachers/index.js";
import { sectionService } from "../../sections/index.js";
import { teacherAssignmentService } from "../../teacher-assignments/index.js";

/* Record-level access for teachers. Other roles that passed authorize() are
   not restricted by section. A teacher may act on a section when they are its
   class teacher or are assigned to teach a subject in it. */

const buildScope = async ctx => {
  const teacher = await teacherService.findByUserId(ctx, ctx.userId);
  if (!teacher) return { teacherId: null, classTeacherOf: new Set(), subjectsBySection: new Map() };

  const [assignments, classSections] = await Promise.all([
    teacherAssignmentService.findForTeacher(ctx, teacher.id),
    sectionService.findByClassTeacher(ctx, teacher.id)
  ]);

  const subjectsBySection = new Map();
  for (const assignment of assignments) {
    if (!subjectsBySection.has(assignment.sectionId)) subjectsBySection.set(assignment.sectionId, new Set());
    subjectsBySection.get(assignment.sectionId).add(assignment.subjectId);
  }
  return { teacherId: teacher.id, classTeacherOf: new Set(classSections.map(s => s.id)), subjectsBySection };
};

export const teachingScope = {
  /* null = unrestricted. Memoised on the request context. */
  of: async ctx => {
    if (ctx.role !== ROLES.TEACHER) return null;
    ctx.teachingScope ??= await buildScope(ctx);
    return ctx.teachingScope;
  },

  /* Section ids a teacher may see (null = all) */
  sectionIds: async ctx => {
    const scope = await teachingScope.of(ctx);
    return scope ? [...new Set([...scope.classTeacherOf, ...scope.subjectsBySection.keys()])] : null;
  },

  canAccessSection: async (ctx, sectionId, { subjectId, classTeacherOnly = false } = {}) => {
    const scope = await teachingScope.of(ctx);
    if (!scope) return true;
    if (scope.classTeacherOf.has(sectionId)) return true;
    if (classTeacherOnly) return false;
    const subjects = scope.subjectsBySection.get(sectionId);
    if (!subjects) return false;
    return subjectId ? subjects.has(subjectId) : true;
  },

  assertSection: async (ctx, sectionId, options = {}) => {
    if (!(await teachingScope.canAccessSection(ctx, sectionId, options))) {
      throw forbidden(
        options.subjectId
          ? "You can only do this for subjects you teach in this section"
          : "You can only do this for sections you teach"
      );
    }
  }
};
