import { asc } from "drizzle-orm";
import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { createRepository } from "../../../../common/database/repository.js";
import { sections } from "../models/section.schema.js";

export const sectionRepository = createRepository({
  table: sections,
  queryKey: "sections",
  orderBy: [asc(sections.classId), asc(sections.sectionName)]
});

describeDuplicates({
  sections_year_class_name_uq: ({ sectionName }) =>
    `Section ${sectionName} already exists in this class for this academic year`
});
