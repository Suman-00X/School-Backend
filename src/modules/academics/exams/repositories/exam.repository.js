import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { asc, eq } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";
import { createRepository, scoped } from "../../../../common/database/repository.js";
/* The table only: the assessment-schemes module itself imports exams */
import { assessmentSchemeExams, assessmentSchemes } from "../../assessment-schemes/models/assessmentScheme.schema.js";
import { exams } from "../models/exam.schema.js";

const base = createRepository({
  table: exams,
  queryKey: "exams",
  orderBy: [asc(exams.startDate), asc(exams.examName)]
});

export const examRepository = {
  ...base,

  /* Lock an exam for the rest of the transaction (publishing results) */
  lockForUpdate: async (tenantId, examId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(exams)
      .where(scoped(exams, tenantId, eq(exams.id, examId)))
      .for("update");
    return row ?? null;
  },

  /* Names of the assessment schemes that combine an exam */
  schemeNames: async (tenantId, examId, { dbc = db } = {}) => {
    const rows = await dbc
      .select({ name: assessmentSchemes.name })
      .from(assessmentSchemes)
      .innerJoin(assessmentSchemeExams, eq(assessmentSchemeExams.schemeId, assessmentSchemes.id))
      .where(scoped(assessmentSchemes, tenantId, eq(assessmentSchemeExams.examId, examId)))
      .orderBy(asc(assessmentSchemes.name));
    return rows.map(row => row.name);
  }
};

describeDuplicates({
  exams_year_name_uq: ({ examName }) => `An exam named ${examName} already exists in this academic year`
});
