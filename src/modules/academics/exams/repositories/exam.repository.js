import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { exams } from "../models/exam.schema.js";

export const examRepository = createRepository({
  table: exams,
  queryKey: "exams",
  orderBy: [asc(exams.startDate), asc(exams.examName)]
});
