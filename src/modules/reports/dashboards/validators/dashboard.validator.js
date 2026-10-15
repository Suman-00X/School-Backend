import { z } from "../../../../common/validation/zod.js";
import { date, id } from "../../../../common/validation/schemas.js";

const range = z
  .object({ from: date().optional(), to: date().optional() })
  .refine(q => !q.from || !q.to || q.to >= q.from, { path: ["to"], message: "must be on or after from" });

export const dashboardValidators = {
  attendance: {
    query: range.and(
      z.object({
        threshold: z.coerce.number().min(1).max(100).default(75),
        minDays: z.coerce.number().int().min(1).max(365).default(5)
      })
    )
  },
  fees: { query: range.and(z.object({ defaulterLimit: z.coerce.number().int().min(1).max(500).default(50) })) },
  academics: { query: z.object({ examId: id() }) }
};
