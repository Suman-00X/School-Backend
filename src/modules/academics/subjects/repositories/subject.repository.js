import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { subjects } from "../models/subject.schema.js";

export const subjectRepository = createRepository({
  table: subjects,
  queryKey: "subjects",
  orderBy: asc(subjects.subjectName)
});
