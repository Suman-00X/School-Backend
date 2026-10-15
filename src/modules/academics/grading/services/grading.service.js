import { asc, eq } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { gradeBands, gradeScales } from "../models/gradeScale.schema.js";
import { gradeBandRepository, gradeScaleRepository } from "../repositories/gradeScale.repository.js";

const withBands = { bands: { orderBy: [asc(gradeBands.minPercent)] } };

/* Bands must tile 0–100 exactly: sorted, starting at 0, each starting where
   the previous ended, the last ending at 100 */
const assertBandsCover = bands => {
  const sorted = [...bands].sort((a, b) => a.minPercent - b.minPercent);
  if (sorted[0].minPercent !== 0) throw unprocessable("The lowest band must start at 0%");
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minPercent !== sorted[i - 1].maxPercent) {
      throw unprocessable(
        `Bands must be contiguous: ${sorted[i - 1].grade} ends at ${sorted[i - 1].maxPercent}% but ${sorted[i].grade} starts at ${sorted[i].minPercent}%`
      );
    }
  }
  if (sorted.at(-1).maxPercent !== 100) throw unprocessable("The highest band must end at 100%");
  return sorted;
};

/* [min, max), except that 100% falls in the top band */
const bandFor = (bands, percentage) =>
  bands.find(
    band =>
      percentage >= band.minPercent && (percentage < band.maxPercent || (band.maxPercent === 100 && percentage === 100))
  ) ?? null;

export const gradingService = {
  list: (ctx, { page, limit }) => gradeScaleRepository.list(ctx.tenantId, { page, limit, with: withBands }),

  getById: async (ctx, scaleId) => {
    const scale = await gradeScaleRepository.findById(ctx.tenantId, scaleId, { with: withBands });
    if (!scale) throw notFound("Grade scale");
    return scale;
  },

  create: (ctx, { bands, ...data }) => {
    const sorted = assertBandsCover(bands);
    return transaction(async tx => {
      if (data.isDefault) await gradeScaleRepository.clearDefault(ctx.tenantId, null, { dbc: tx });
      const scale = await gradeScaleRepository.create(ctx.tenantId, data, { dbc: tx });
      const created = await gradeBandRepository.replaceForScale(ctx.tenantId, scale.id, sorted, { dbc: tx });
      return { ...scale, bands: created };
    });
  },

  update: async (ctx, scaleId, { bands, ...data }) => {
    const sorted = bands && assertBandsCover(bands);
    await transaction(async tx => {
      const scale = await gradeScaleRepository.findById(ctx.tenantId, scaleId, { dbc: tx });
      if (!scale) throw notFound("Grade scale");
      if (data.isDefault) await gradeScaleRepository.clearDefault(ctx.tenantId, scaleId, { dbc: tx });
      await gradeScaleRepository.update(ctx.tenantId, scaleId, data, { dbc: tx });
      if (sorted) await gradeBandRepository.replaceForScale(ctx.tenantId, scaleId, sorted, { dbc: tx });
    });
    return gradingService.getById(ctx, scaleId);
  },

  remove: async (ctx, scaleId) => {
    const row = await gradeScaleRepository.softDelete(ctx.tenantId, scaleId);
    if (!row) throw notFound("Grade scale");
    return row;
  },

  /* For other submodules */

  /* The scale for an exam: its own, else the school default, else null */
  resolveScale: async (ctx, gradeScaleId) => {
    const scale = gradeScaleId
      ? await gradeScaleRepository.findById(ctx.tenantId, gradeScaleId, { with: withBands })
      : await gradeScaleRepository.findOne(ctx.tenantId, [eq(gradeScales.isDefault, true)], { with: withBands });
    return scale ?? null;
  },

  exists: (ctx, gradeScaleId) => gradeScaleRepository.exists(ctx.tenantId, [eq(gradeScales.id, gradeScaleId)]),

  /* -> { grade, gradePoint, remark, isPassing } or null */
  gradeFor: (scale, percentage) => {
    if (!scale || percentage === null || percentage === undefined) return null;
    const band = bandFor(scale.bands, Math.round(percentage * 100) / 100);
    return band
      ? { grade: band.grade, gradePoint: band.gradePoint, remark: band.remark, isPassing: band.isPassing }
      : null;
  }
};
