import { eq } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { unprocessable } from "../../../../common/http/errors.js";
import { toYearYY } from "../../../../common/utils/date.util.js";
import { teacherService } from "../../../users/teachers/index.js";
import { academicYearService } from "../../academic-years/index.js";
import { classService } from "../../classes/index.js";
import { sections } from "../models/section.schema.js";
import { sectionRepository } from "../repositories/section.repository.js";

const withDetails = {
  class: { columns: { id: true, className: true, classOrder: true } },
  classTeacher: { columns: { id: true, employeeCode: true } }
};

const base = createCrudService(sectionRepository, { entity: "Section", with: withDetails });

const assertReferences = async (ctx, { classId, classTeacherId }) => {
  if (classId && !(await classService.exists(ctx, classId))) {
    throw unprocessable("classId does not refer to an existing class");
  }
  if (classTeacherId && !(await teacherService.exists(ctx, classTeacherId))) {
    throw unprocessable("classTeacherId does not refer to an existing teacher");
  }
};

export const sectionService = {
  getById: base.getById,

  /* Year-scoped: ctx.academicYearId comes from resolveAcademicYear */
  list: (ctx, { page, limit, classId }) =>
    base.list(
      ctx,
      { page, limit },
      [eq(sections.academicYearId, ctx.academicYearId), classId && eq(sections.classId, classId)].filter(Boolean)
    ),

  create: async (ctx, data) => {
    await assertReferences(ctx, data);
    return sectionRepository.create(ctx.tenantId, { ...data, academicYearId: ctx.academicYearId });
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
    return sectionRepository.createMany(
      ctx.tenantId,
      items.map(item => ({ ...item, academicYearId: ctx.academicYearId }))
    );
  },

  update: async (ctx, sectionId, data) => {
    await assertReferences(ctx, data);
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
      classSequence: section.class.classOrder,
      sectionName: section.sectionName
    };
  },

  isInAcademicYear: (ctx, academicYearId, sectionId) =>
    sectionRepository.exists(ctx.tenantId, [eq(sections.id, sectionId), eq(sections.academicYearId, academicYearId)])
};
