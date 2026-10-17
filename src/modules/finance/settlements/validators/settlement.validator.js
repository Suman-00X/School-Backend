import { z } from "../../../../common/validation/zod.js";
import { date, listQuery } from "../../../../common/validation/schemas.js";

export const settlementValidators = {
  list: { query: listQuery({ from: date().optional(), to: date().optional() }) },
  /* Both optional: the last 7 days */
  import: { body: z.object({ from: date().optional(), to: date().optional() }) }
};
