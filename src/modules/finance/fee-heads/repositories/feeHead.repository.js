import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { feeHeads } from "../models/feeHead.schema.js";

export const feeHeadRepository = createRepository({
  table: feeHeads,
  queryKey: "feeHeads",
  orderBy: asc(feeHeads.name)
});

describeDuplicates({
  fee_heads_tenant_code_uq: ({ code }) => `A fee head with code ${code} already exists`,
  fee_heads_tenant_name_uq: ({ name }) => `A fee head named ${name} already exists`
});
