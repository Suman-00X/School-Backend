import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { sections } from "../models/section.schema.js";

export const sectionRepository = createRepository({
  table: sections,
  queryKey: "sections",
  orderBy: [asc(sections.classId), asc(sections.sectionName)]
});
