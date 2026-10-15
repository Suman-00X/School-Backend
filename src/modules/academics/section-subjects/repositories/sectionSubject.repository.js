import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { sectionSubjects } from "../models/sectionSubject.schema.js";

export const sectionSubjectRepository = createRepository({
  table: sectionSubjects,
  queryKey: "sectionSubjects",
  orderBy: asc(sectionSubjects.displayCode)
});
