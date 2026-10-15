import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { feeHeads } from "../models/feeHead.schema.js";

export const feeHeadRepository = createRepository({
  table: feeHeads,
  queryKey: "feeHeads",
  orderBy: asc(feeHeads.name)
});
