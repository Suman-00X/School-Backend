import { and, asc, desc, eq, ne } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { gradeBands, gradeScales } from "../models/gradeScale.schema.js";

export const gradeScaleRepository = {
  ...createRepository({
    table: gradeScales,
    queryKey: "gradeScales",
    orderBy: [desc(gradeScales.isDefault), asc(gradeScales.name)]
  }),

  clearDefault: (tenantId, exceptId, { dbc = db } = {}) =>
    dbc
      .update(gradeScales)
      .set({ isDefault: false })
      .where(
        and(
          eq(gradeScales.tenantId, tenantId),
          eq(gradeScales.isDefault, true),
          exceptId ? ne(gradeScales.id, exceptId) : undefined
        )
      )
};

export const gradeBandRepository = {
  ...createRepository({ table: gradeBands, queryKey: "gradeBands", orderBy: asc(gradeBands.minPercent) }),

  /* Bands belong to their scale and are replaced as a set */
  replaceForScale: async (tenantId, gradeScaleId, bands, { dbc = db } = {}) => {
    await dbc
      .delete(gradeBands)
      .where(and(eq(gradeBands.tenantId, tenantId), eq(gradeBands.gradeScaleId, gradeScaleId)));
    return dbc
      .insert(gradeBands)
      .values(bands.map((band, index) => ({ ...band, gradeScaleId, tenantId, sortOrder: index })))
      .returning();
  }
};
