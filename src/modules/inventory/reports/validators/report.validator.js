import { z } from "../../../../common/validation/zod.js";
import { date } from "../../../../common/validation/schemas.js";

/* Omit for JSON; csv or xlsx downloads a file */
const format = z.enum(["csv", "xlsx"]).optional();

export const reportValidators = {
  lowStock: { query: z.object({ format }) },
  valuation: { query: z.object({ format }) },
  consumption: {
    query: z
      .object({ format, from: date(), to: date() })
      .refine(q => q.to >= q.from, { path: ["to"], message: "must be on or after from" })
  }
};
