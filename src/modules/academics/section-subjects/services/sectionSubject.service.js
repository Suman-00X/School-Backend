import { eq, inArray } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { conflict, unprocessable } from "../../../../common/http/errors.js";
import { sectionService } from "../../sections/index.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { subjectService } from "../../subjects/index.js";
import { sectionSubjectCode } from "../../shared/utils/codes.util.js";
import { sectionSubjects } from "../models/sectionSubject.schema.js";
import { sectionSubjectRepository } from "../repositories/sectionSubject.repository.js";

const base = createCrudService(sectionSubjectRepository, {
  entity: "Section subject",
  with: { subject: { columns: { id: true, subjectName: true, subjectCode: true } } }
});

const taughtConditions = (academicYearId, sectionId, subjectId) => [
  eq(sectionSubjects.academicYearId, academicYearId),
  eq(sectionSubjects.sectionId, sectionId),
  eq(sectionSubjects.subjectId, subjectId)
];

export const sectionSubjectService = {
  remove: base.remove,

  /* Year-scoped: subjects of one section (teachers: a section they teach) */
  list: async (ctx, { page, limit, sectionId }) => {
    await teachingScope.assertSection(ctx, sectionId);
    return base.list(ctx, { page, limit }, [
      eq(sectionSubjects.academicYearId, ctx.academicYearId),
      eq(sectionSubjects.sectionId, sectionId)
    ]);
  },

  create: async (ctx, { sectionId, subjectId, weeklyNoOfClasses, description }) => {
    const placement = await sectionService.getPlacement(ctx, ctx.academicYearId, sectionId);

    const subject = await subjectService.findById(ctx, subjectId);
    if (!subject) throw unprocessable("subjectId does not refer to an existing subject");

    if (await sectionSubjectService.isTaught(ctx, ctx.academicYearId, sectionId, subjectId)) {
      throw conflict("This subject is already assigned to the section");
    }

    return sectionSubjectRepository.create(ctx.tenantId, {
      academicYearId: ctx.academicYearId,
      sectionId,
      subjectId,
      displayCode: sectionSubjectCode({ subjectCode: subject.subjectCode, ...placement }),
      weeklyNoOfClasses,
      description
    });
  },

  /* For other submodules */
  findForSections: (ctx, sectionIds) =>
    sectionIds.length
      ? sectionSubjectRepository.findMany(ctx.tenantId, {
          conditions: [inArray(sectionSubjects.sectionId, sectionIds)]
        })
      : [],

  /* For class subjects: adds the subject to each of the sections that lacks it -> the rows created */
  addToSections: async (
    ctx,
    academicYearId,
    sectionIds,
    subject,
    { classSubjectCode, weeklyNoOfClasses, description },
    { dbc } = {}
  ) => {
    if (!sectionIds.length) return [];
    const taught = await sectionSubjectRepository.findMany(ctx.tenantId, {
      conditions: [inArray(sectionSubjects.sectionId, sectionIds), eq(sectionSubjects.subjectId, subject.id)],
      dbc
    });
    const missing = sectionIds.filter(sectionId => !taught.some(row => row.sectionId === sectionId));
    if (!missing.length) return [];

    const placements = await Promise.all(missing.map(sectionId => sectionService.getPlacement(ctx, academicYearId, sectionId)));
    return sectionSubjectRepository.createMany(
      ctx.tenantId,
      placements.map(placement => ({
        academicYearId,
        sectionId: placement.section.id,
        subjectId: subject.id,
        displayCode: sectionSubjectCode({ classSubjectCode, sectionName: placement.sectionName }),
        weeklyNoOfClasses,
        description
      })),
      { dbc }
    );
  },

  /* For class subjects: the new classes a week and note of the subject in the sections */
  updateInSections: (ctx, sectionIds, subjectId, values, { dbc } = {}) =>
    sectionIds.length && Object.keys(values).length
      ? sectionSubjectRepository.updateWhere(
          ctx.tenantId,
          [inArray(sectionSubjects.sectionId, sectionIds), eq(sectionSubjects.subjectId, subjectId)],
          values,
          { dbc }
        )
      : [],

  /* For class subjects: takes the subject off the sections -> the rows removed */
  removeFromSections: (ctx, sectionIds, subjectId, { dbc } = {}) =>
    sectionIds.length
      ? sectionSubjectRepository.softDeleteWhere(
          ctx.tenantId,
          [inArray(sectionSubjects.sectionId, sectionIds), eq(sectionSubjects.subjectId, subjectId)],
          { dbc }
        )
      : [],

  isTaught: (ctx, academicYearId, sectionId, subjectId) =>
    sectionSubjectRepository.exists(ctx.tenantId, taughtConditions(academicYearId, sectionId, subjectId)),

  /* Taught in the section, or in another section of its class that year */
  isTaughtInClass: async (ctx, section, subjectId) => {
    const classSections = (await sectionService.findAllInYear(ctx, section.academicYearId))
      .filter(other => other.classId === section.classId)
      .map(other => other.id);
    return sectionSubjectRepository.exists(ctx.tenantId, [
      inArray(sectionSubjects.sectionId, classSections),
      eq(sectionSubjects.subjectId, subjectId)
    ]);
  }
};
