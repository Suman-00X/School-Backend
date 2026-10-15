import { eq, ne } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { conflict, notFound } from "../../../../common/http/errors.js";
import { periods } from "../models/period.schema.js";
import { periodRepository } from "../repositories/period.repository.js";

const base = createCrudService(periodRepository, { entity: "Period" });

/* "08:30" -> "08:30:00" so stored and new values compare as strings */
const toTime = value => (value && value.length === 5 ? `${value}:00` : value);

const assertNoOverlap = async (ctx, academicYearId, { startTime, endTime }, exceptId) => {
  const existing = await periodRepository.findMany(ctx.tenantId, {
    conditions: [eq(periods.academicYearId, academicYearId), exceptId && ne(periods.id, exceptId)].filter(Boolean)
  });
  const clash = existing.find(period => startTime < period.endTime && endTime > period.startTime);
  if (clash) {
    throw conflict(`This time overlaps ${clash.name} (${clash.startTime.slice(0, 5)}–${clash.endTime.slice(0, 5)})`);
  }
};

export const periodService = {
  getById: base.getById,
  remove: base.remove,

  /* Year-scoped, in bell order */
  list: (ctx, { page, limit }) => base.list(ctx, { page, limit }, [eq(periods.academicYearId, ctx.academicYearId)]),

  create: async (ctx, data) => {
    const times = { startTime: toTime(data.startTime), endTime: toTime(data.endTime) };
    await assertNoOverlap(ctx, ctx.academicYearId, times);
    return periodRepository.create(ctx.tenantId, { ...data, ...times, academicYearId: ctx.academicYearId });
  },

  update: async (ctx, periodId, data) => {
    const existing = await periodRepository.findById(ctx.tenantId, periodId);
    if (!existing) throw notFound("Period");
    const times = {
      startTime: toTime(data.startTime) ?? existing.startTime,
      endTime: toTime(data.endTime) ?? existing.endTime
    };
    if (times.endTime <= times.startTime) throw conflict("endTime must be after startTime");
    if (data.startTime || data.endTime) await assertNoOverlap(ctx, existing.academicYearId, times, periodId);
    return base.update(ctx, periodId, {
      ...data,
      ...(data.startTime && { startTime: times.startTime }),
      ...(data.endTime && { endTime: times.endTime })
    });
  },

  /* For other submodules */
  findById: (ctx, periodId) => periodRepository.findById(ctx.tenantId, periodId),
  findAllInYear: (ctx, academicYearId) =>
    periodRepository.findMany(ctx.tenantId, { conditions: [eq(periods.academicYearId, academicYearId)] })
};
