import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { asc, eq } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
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
  }
};

describeDuplicates({
  exams_year_name_uq: ({ examName }) => `An exam named ${examName} already exists in this academic year`
});
