import { z } from "../../../../common/validation/zod.js";
import { date } from "../../../../common/validation/schemas.js";
import { BORROWER_ROLES } from "../../shared/constants/library.constants.js";

/* Omit for JSON; csv or xlsx downloads a file */
const format = z.enum(["csv", "xlsx"]).optional();

const period = z
  .object({ format, from: date(), to: date() })
  .refine(q => q.to >= q.from, { path: ["to"], message: "must be on or after from" });

export const reportValidators = {
  currentLoans: { query: z.object({ format }) },
  overdue: { query: z.object({ format }) },
  finesCollected: { query: period },
  finesOutstanding: { query: z.object({ format }) },
  mostBorrowed: {
    query: z
      .object({ format, from: date(), to: date(), limit: z.coerce.number().int().min(1).max(100).default(20) })
      .refine(q => q.to >= q.from, { path: ["to"], message: "must be on or after from" })
  },
  inactiveBorrowers: { query: z.object({ format, since: date(), role: z.enum(BORROWER_ROLES).optional() }) },
  acquisitions: { query: period }
};
