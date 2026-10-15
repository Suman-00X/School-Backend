import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { examPapers } from "../models/examPaper.schema.js";

export const examPaperRepository = createRepository({
  table: examPapers,
  queryKey: "examPapers",
  orderBy: [asc(examPapers.examDate), asc(examPapers.displayCode)]
});
