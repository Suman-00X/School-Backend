import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { classes } from "../models/class.schema.js";

export const classRepository = createRepository({
  table: classes,
  queryKey: "classes",
  orderBy: asc(classes.classOrder)
});
