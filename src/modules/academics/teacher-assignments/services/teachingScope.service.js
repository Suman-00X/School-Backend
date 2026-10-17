import { ROLES } from "../../../../common/auth/roles.js";
import { forbidden } from "../../../../common/http/errors.js";
import { teacherService } from "../../../users/teachers/index.js";
import { academicYearService } from "../../academic-years/index.js";
import { sectionService } from "../../sections/index.js";
import { sectionSubjectService } from "../../section-subjects/index.js";
import { teacherAssignmentService } from "./teacherAssignment.service.js";

/* Record-level access for teachers (D-11). Other roles that passed authorize() are
   not restricted by section. A teacher's scope is the sections of the current academic
   year where they are class teacher or deputy class teacher, or are assigned to teach a
   subject. Earlier years' sections, with their students and records, are outside it. */

export const OUTSIDE_SCOPE = "You can only do this for sections you teach";

const emptyScope = teacherId => ({
  teacherId,
  academicYearId: null,
  classTeacherOf: new Set(),
  deputyOf: new Set(),
  subjectsBySection: new Map()
});

const buildScope = async ctx => {
  const teacher = await teacherService.findByUserId(ctx, ctx.userId);
  const year = teacher && (await academicYearService.findCurrent(ctx));
  if (!year) return emptyScope(teacher?.id ?? null);

  const [assignments, ledSections] = await Promise.all([
    teacherAssignmentService.findForTeacher(ctx, teacher.id, year.id),
    sectionService.findLedBy(ctx, teacher.id, year.id)
  ]);

  const subjectsBySection = new Map();
  for (const assignment of assignments) {
    if (!subjectsBySection.has(assignment.sectionId)) subjectsBySection.set(assignment.sectionId, new Set());
    subjectsBySection.get(assignment.sectionId).add(assignment.subjectId);
  }
  const idsWhere = test => new Set(ledSections.filter(test).map(section => section.id));
  return {
    teacherId: teacher.id,
    academicYearId: year.id,
    classTeacherOf: idsWhere(section => section.classTeacherId === teacher.id),
    deputyOf: idsWhere(section => section.deputyClassTeacherId === teacher.id),
    subjectsBySection
  };
};

const sectionsOf = scope => [
  ...new Set([...scope.classTeacherOf, ...scope.deputyOf, ...scope.subjectsBySection.keys()])
];

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

  /* Sections where the teacher is class teacher (null = all). Deputies are not included. */
  classTeacherSectionIds: async ctx => {
    const scope = await teachingScope.of(ctx);
    return scope ? [...scope.classTeacherOf] : null;
  },

  /* Is the caller the section's class teacher or its deputy? (true for unrestricted roles) */
  leadsSection: async (ctx, sectionId) => {
    const scope = await teachingScope.of(ctx);
    return !scope || scope.classTeacherOf.has(sectionId) || scope.deputyOf.has(sectionId);
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

  /* The class teacher reaches every subject of the section; a deputy, the section itself
     and the subjects they are assigned; a subject teacher, their subjects */
  canAccessSection: async (ctx, sectionId, { subjectId, classTeacherOnly = false } = {}) => {
    const scope = await teachingScope.of(ctx);
    if (!scope) return true;
    if (scope.classTeacherOf.has(sectionId)) return true;
    if (classTeacherOnly) return false;
    const subjects = scope.subjectsBySection.get(sectionId);
    if (subjectId) return Boolean(subjects?.has(subjectId));
    return Boolean(subjects) || scope.deputyOf.has(sectionId);
  },

  /* 403 outside the teacher's scope. classTeacherOnly: the class teacher alone
     (a subject teacher or deputy of the section is told so, with `message`). */
  assertSection: async (ctx, sectionId, options = {}) => {
    if (await teachingScope.canAccessSection(ctx, sectionId, options)) return;
    if (options.subjectId) throw forbidden("You can only do this for subjects you teach in this section");
    const scope = await teachingScope.of(ctx);
    if (options.classTeacherOnly && (scope.subjectsBySection.has(sectionId) || scope.deputyOf.has(sectionId))) {
      throw forbidden(options.message ?? "Only the class teacher of this section can do this");
    }
    throw forbidden(OUTSIDE_SCOPE);
  },

  /* Report cards (live, PDF, snapshots, comparisons): class teachers only (D-11), not deputies */
  assertReportCards: (ctx, sectionId) =>
    teachingScope.assertSection(ctx, sectionId, {
      classTeacherOnly: true,
      message: "Only the class teacher of this section can see its report cards"
    })
};
