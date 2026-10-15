import { eq } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { transaction } from "../../../../common/database/postgres.js";
import { notFound } from "../../../../common/http/errors.js";
import { academicYears } from "../models/academicYear.schema.js";
import { academicYearRepository } from "../repositories/academicYear.repository.js";

const base = createCrudService(academicYearRepository, { entity: "Academic year" });

export const academicYearService = {
  list: base.list,
  getById: base.getById,

  getCurrent: async ctx => {
    const year = await academicYearService.findCurrent(ctx);
    if (!year) throw notFound("Current academic year");
    return year;
  },

  /* Marking a year current un-marks the previous one in the same transaction */
  create: (ctx, data) =>
    transaction(async tx => {
      if (data.isCurrent) await academicYearRepository.clearCurrent(ctx.tenantId, null, { dbc: tx });
      return academicYearRepository.create(ctx.tenantId, data, { dbc: tx });
    }),

  update: (ctx, academicYearId, data) =>
    transaction(async tx => {
      const existing = await academicYearRepository.findById(ctx.tenantId, academicYearId, { dbc: tx });
      if (!existing) throw notFound("Academic year");

      if (data.isCurrent) await academicYearRepository.clearCurrent(ctx.tenantId, academicYearId, { dbc: tx });
      return academicYearRepository.update(ctx.tenantId, academicYearId, data, { dbc: tx });
    }),

  /* For other submodules: null when missing */
  findById: (ctx, academicYearId) => academicYearRepository.findById(ctx.tenantId, academicYearId),
  findCurrent: ctx => academicYearRepository.findOne(ctx.tenantId, [eq(academicYears.isCurrent, true)])
};
