import { eq, inArray, or, sql } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { forbidden, notFound, unprocessable } from "../../../../common/http/errors.js";
import { toYearYY } from "../../../../common/utils/date.util.js";
import { teacherService } from "../../../users/teachers/index.js";
import { academicYearService } from "../../academic-years/index.js";
import { classSubjectService } from "../../class-subjects/index.js";
import { classCodeLabel, classService } from "../../classes/index.js";
import { OUTSIDE_SCOPE, teachingScope } from "../../teacher-assignments/index.js";
import { sections } from "../models/section.schema.js";
import { sectionRepository } from "../repositories/section.repository.js";

const withDetails = {
  class: { columns: { id: true, level: true, className: true, classOrder: true } },
  classTeacher: { columns: { id: true, employeeCode: true } },
  deputyClassTeacher: { columns: { id: true, employeeCode: true } }
};

const base = createCrudService(sectionRepository, { entity: "Section", with: withDetails });

const assertReferences = async (ctx, { classId, classTeacherId, deputyClassTeacherId }) => {
  if (classId && !(await classService.exists(ctx, classId))) {
    throw unprocessable("classId does not refer to an existing class");
  }
  if (classTeacherId && !(await teacherService.exists(ctx, classTeacherId))) {
    throw unprocessable("classTeacherId does not refer to an existing teacher");
  }
  if (deputyClassTeacherId && !(await teacherService.exists(ctx, deputyClassTeacherId))) {
    throw unprocessable("deputyClassTeacherId does not refer to an existing teacher");
  }
};

/* After an update, the deputy must still be someone other than the class teacher */
const assertDeputyDiffers = (existing, data) => {
  const classTeacherId = data.classTeacherId ?? existing.classTeacherId;
  const deputyId = data.deputyClassTeacherId === undefined ? existing.deputyClassTeacherId : data.deputyClassTeacherId;
  if (deputyId && deputyId === classTeacherId) {
    throw unprocessable("The deputy class teacher must be a different teacher from the class teacher");
  }
};

/* Teachers: only the sections they teach (D-11) */
const inScope = async ctx => {
  const visible = await teachingScope.sectionIds(ctx);
  if (!visible) return undefined;
  return visible.length ? inArray(sections.id, visible) : sql`false`;
};

export const sectionService = {
  getById: async (ctx, sectionId) => {
    const section = await base.getById(ctx, sectionId);
    if (!(await teachingScope.canAccessSection(ctx, sectionId))) throw forbidden(OUTSIDE_SCOPE);
    return section;
  },

  /* Year-scoped: ctx.academicYearId comes from resolveAcademicYear */
  list: async (ctx, { page, limit, classId }) =>
    base.list(
      ctx,
      { page, limit },
      [
        eq(sections.academicYearId, ctx.academicYearId),
        classId && eq(sections.classId, classId),
        await inScope(ctx)
      ].filter(Boolean)
    ),

  create: async (ctx, data) => {
    await assertReferences(ctx, data);
    const section = await sectionRepository.create(ctx.tenantId, { ...data, academicYearId: ctx.academicYearId });
    await classSubjectService.applyToSections(ctx, ctx.academicYearId, [section]);
    return section;
  },

  createMany: async (ctx, items) => {
    if (
      !(await classService.allExist(
        ctx,
        items.map(item => item.classId)
      ))
    ) {
      throw unprocessable("One or more sections reference a class that does not exist");
    }
    const created = await sectionRepository.createMany(
      ctx.tenantId,
      items.map(item => ({ ...item, academicYearId: ctx.academicYearId }))
    );
    await classSubjectService.applyToSections(ctx, ctx.academicYearId, created);
    return created;
  },

  update: async (ctx, sectionId, data) => {
    await assertReferences(ctx, data);
    if (data.classTeacherId || data.deputyClassTeacherId) {
      const existing = await sectionRepository.findById(ctx.tenantId, sectionId);
      if (!existing) throw notFound("Section");
      assertDeputyDiffers(existing, data);
    }
    return base.update(ctx, sectionId, data);
  },

  /* For other submodules: a section inside a given academic year, with the
     values used to build codes. Throws 422 when it does not belong there. */
  getPlacement: async (ctx, academicYearId, sectionId) => {
    const academicYear = await academicYearService.findById(ctx, academicYearId);
    if (!academicYear) throw unprocessable("academicYearId does not refer to an existing academic year");

    const section = await sectionRepository.findOne(
      ctx.tenantId,
      [eq(sections.id, sectionId), eq(sections.academicYearId, academicYearId)],
      { with: { class: true } }
    );
    if (!section) throw unprocessable("The section does not belong to the selected academic year");
    if (!section.class?.isActive) throw unprocessable("The section's class is no longer active");

    return {
      academicYear,
      section,
      yearYY: toYearYY(academicYear.startDate),
      classSequence: classCodeLabel(section.class),
      sectionName: section.sectionName
    };
  },

  isInAcademicYear: (ctx, academicYearId, sectionId) =>
    sectionRepository.exists(ctx.tenantId, [eq(sections.id, sectionId), eq(sections.academicYearId, academicYearId)]),

  /* null when missing */
  findById: (ctx, sectionId) => sectionRepository.findById(ctx.tenantId, sectionId, { with: { class: true } }),

  /* Sections of a year (all of them, with class) */
  findAllInYear: (ctx, academicYearId) =>
    sectionRepository.findMany(ctx.tenantId, {
      conditions: [eq(sections.academicYearId, academicYearId)],
      with: { class: { columns: { id: true, level: true, className: true, classOrder: true } } }
    }),

  findManyByIds: (ctx, sectionIds) =>
    sectionIds.length
      ? sectionRepository.findMany(ctx.tenantId, { conditions: [inArray(sections.id, sectionIds)] })
      : [],

  /* Sections of a year where the teacher is class teacher or deputy class teacher */
  findLedBy: (ctx, teacherId, academicYearId) =>
    sectionRepository.findMany(ctx.tenantId, {
      conditions: [
        eq(sections.academicYearId, academicYearId),
        or(eq(sections.classTeacherId, teacherId), eq(sections.deputyClassTeacherId, teacherId))
      ]
    })
};
