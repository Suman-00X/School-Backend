import { asc } from "drizzle-orm";
import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { createRepository } from "../../../../common/database/repository.js";
import { subjects } from "../models/subject.schema.js";

export const subjectRepository = createRepository({
  table: subjects,
  queryKey: "subjects",
  orderBy: asc(subjects.subjectName)
});

describeDuplicates({
  subjects_tenant_code_uq: ({ subjectCode }) => `A subject with code ${subjectCode} already exists`,
  subjects_tenant_name_uq: ({ subjectName }) => `A subject named ${subjectName} already exists`
});
