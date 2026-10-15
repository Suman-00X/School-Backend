import { eq } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { exams } from "../models/exam.schema.js";
import { examRepository } from "../repositories/exam.repository.js";

const base = createCrudService(examRepository, { entity: "Exam" });

export const examService = {
  getById: base.getById,
  update: base.update,

  /* Year-scoped (ctx.academicYearId from resolveAcademicYear) */
  list: (ctx, { page, limit }) => base.list(ctx, { page, limit }, [eq(exams.academicYearId, ctx.academicYearId)]),

  create: (ctx, data) => examRepository.create(ctx.tenantId, { ...data, academicYearId: ctx.academicYearId }),

  createMany: (ctx, items) =>
    examRepository.createMany(ctx.tenantId, items.map(item => ({ ...item, academicYearId: ctx.academicYearId })))
};
