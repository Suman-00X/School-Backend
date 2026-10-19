import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { and, asc, eq } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { assessmentSchemeExams, assessmentSchemes } from "../models/assessmentScheme.schema.js";

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
  assessment_schemes_year_name_uq: ({ name }) =>
    `An assessment scheme named ${name} already exists in this academic year`
});
