import { asc } from "drizzle-orm";
import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { createRepository } from "../../../../common/database/repository.js";
import { classes } from "../models/class.schema.js";
import { levelInfo } from "../utils/classLevel.util.js";

export const classRepository = createRepository({
  table: classes,
  queryKey: "classes",
  orderBy: [asc(classes.classOrder), asc(classes.className)]
});

describeDuplicates({
  classes_tenant_level_uq: ({ level }) => `A class named ${levelInfo(level)?.className ?? level} already exists`,
  classes_tenant_name_uq: ({ className }) => `A class named ${className} already exists`
});
