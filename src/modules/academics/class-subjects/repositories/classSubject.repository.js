import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { classSubjects } from "../models/classSubject.schema.js";

export const classSubjectRepository = createRepository({
  table: classSubjects,
  queryKey: "classSubjects",
  orderBy: asc(classSubjects.createdAt)
});
