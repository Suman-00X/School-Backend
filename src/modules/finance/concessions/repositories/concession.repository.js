import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { concessions, studentConcessions } from "../models/concession.schema.js";

export const concessionRepository = createRepository({
  table: concessions,
  queryKey: "concessions",
  orderBy: asc(concessions.name)
});

export const studentConcessionRepository = createRepository({
  table: studentConcessions,
  queryKey: "studentConcessions"
});
