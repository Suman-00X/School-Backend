import { ROLES } from "../../../../common/auth/roles.js";
import { forbidden } from "../../../../common/http/errors.js";
import { teacherService } from "../../../users/teachers/index.js";
import { sectionService } from "../../sections/index.js";
import { sectionSubjectService } from "../../section-subjects/index.js";
import { teacherAssignmentService } from "./teacherAssignment.service.js";

/* Record-level access for teachers (D-11). Other roles that passed authorize() are
   not restricted by section. A teacher's scope is the sections where they are class
   teacher or are assigned to teach a subject. */

export const OUTSIDE_SCOPE = "You can only do this for sections you teach";

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

const sectionsOf = scope => [...new Set([...scope.classTeacherOf, ...scope.subjectsBySection.keys()])];

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
    return scope ? sectionsOf(scope) : null;
  },

  /* Sections where the teacher is class teacher (null = all) */
  classTeacherSectionIds: async ctx => {
    const scope = await teachingScope.of(ctx);
    return scope ? [...scope.classTeacherOf] : null;
  },

  /* Classes of the teacher's sections (null = all) */
  classIds: async ctx => {
    const scope = await teachingScope.of(ctx);
    if (!scope) return null;
    scope.classIds ??= [...new Set((await sectionService.findManyByIds(ctx, sectionsOf(scope))).map(s => s.classId))];
    return scope.classIds;
  },

  /* Subjects studied in the teacher's sections (null = all) */
  subjectIds: async ctx => {
    const scope = await teachingScope.of(ctx);
    if (!scope) return null;
    scope.subjectIds ??= [
      ...new Set([
        ...(await sectionSubjectService.findForSections(ctx, sectionsOf(scope))).map(s => s.subjectId),
        ...[...scope.subjectsBySection.values()].flatMap(subjects => [...subjects])
      ])
    ];
    return scope.subjectIds;
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

  /* 403 outside the teacher's scope. classTeacherOnly: the class teacher alone
     (a subject teacher of the section is told so, with `message`). */
  assertSection: async (ctx, sectionId, options = {}) => {
    if (await teachingScope.canAccessSection(ctx, sectionId, options)) return;
    if (options.subjectId) throw forbidden("You can only do this for subjects you teach in this section");
    const scope = await teachingScope.of(ctx);
    if (options.classTeacherOnly && scope.subjectsBySection.has(sectionId)) {
      throw forbidden(options.message ?? "Only the class teacher of this section can do this");
    }
    throw forbidden(OUTSIDE_SCOPE);
  },

  /* Report cards (live, PDF, snapshots, comparisons): class teachers only (D-11) */
  assertReportCards: (ctx, sectionId) =>
    teachingScope.assertSection(ctx, sectionId, {
      classTeacherOnly: true,
      message: "Only the class teacher of this section can see its report cards"
    })
};
