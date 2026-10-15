import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { studentParents } from "../models/studentParent.schema.js";

export const studentParentRepository = createRepository({
  table: studentParents,
  queryKey: "studentParents",
  orderBy: asc(studentParents.createdAt)
});
