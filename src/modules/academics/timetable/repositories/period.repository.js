import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { periods } from "../models/period.schema.js";

export const periodRepository = createRepository({
  table: periods,
  queryKey: "periods",
  orderBy: asc(periods.periodNumber)
});
