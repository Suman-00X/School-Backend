import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { and, asc, eq, notInArray } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { assessmentSchemeBuckets, assessmentSchemeExams, assessmentSchemes } from "../models/assessmentScheme.schema.js";

const base = createRepository({
  table: assessmentSchemes,
  queryKey: "assessmentSchemes",
  orderBy: asc(assessmentSchemes.name)
});

export const assessmentSchemeRepository = {
  ...base,

  /* Lock a scheme for the rest of the transaction (publishing results) */
  lockForUpdate: async (tenantId, schemeId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(assessmentSchemes)
      .where(scoped(assessmentSchemes, tenantId, eq(assessmentSchemes.id, schemeId)))
      .for("update");
    return row ?? null;
  },

  /* Buckets keep their ids (teachers' items point at them): update the kept ones,
     add the new ones, soft-delete the rest */
  replaceBuckets: async (tenantId, schemeId, items, { dbc = db } = {}) => {
    const kept = items.filter(item => item.id).map(item => item.id);
    await dbc
      .update(assessmentSchemeBuckets)
      .set({ isActive: false })
      .where(
        and(
          scoped(assessmentSchemeBuckets, tenantId, eq(assessmentSchemeBuckets.schemeId, schemeId)),
          ...(kept.length ? [notInArray(assessmentSchemeBuckets.id, kept)] : [])
        )
      );
    for (const [index, { id, name, weight }] of items.entries()) {
      if (id) {
        await dbc
          .update(assessmentSchemeBuckets)
          .set({ name, weight, sortOrder: index })
          .where(scoped(assessmentSchemeBuckets, tenantId, eq(assessmentSchemeBuckets.id, id)));
      } else {
        await dbc.insert(assessmentSchemeBuckets).values({ tenantId, schemeId, name, weight, sortOrder: index });
      }
    }
  },

  /* A scheme's exams are replaced as a set */
  replaceExams: async (tenantId, schemeId, items, { dbc = db } = {}) => {
    await dbc
      .delete(assessmentSchemeExams)
      .where(and(eq(assessmentSchemeExams.tenantId, tenantId), eq(assessmentSchemeExams.schemeId, schemeId)));
    return dbc
      .insert(assessmentSchemeExams)
      .values(items.map((item, index) => ({ ...item, schemeId, tenantId, sortOrder: index })))
      .returning();
  }
};

describeDuplicates({
  assessment_scheme_buckets_name_uq: () => "Two buckets of a scheme cannot share a name",
  assessment_schemes_year_name_uq: ({ name }) =>
    `An assessment scheme named ${name} already exists in this academic year`
});
