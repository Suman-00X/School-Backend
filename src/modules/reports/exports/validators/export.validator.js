import { z } from "../../../../common/validation/zod.js";
import { date, id } from "../../../../common/validation/schemas.js";

const format = z.enum(["csv", "xlsx"]).default("xlsx");
const range = { from: date(), to: date() };
const ordered = q => q.to >= q.from;

export const exportValidators = {
  students: { query: z.object({ format }) },
  attendance: {
    query: z
      .object({ format, sectionId: id(), ...range })
      .refine(ordered, { path: ["to"], message: "must be on or after from" })
  },
  feeCollections: {
    query: z.object({ format, ...range }).refine(ordered, { path: ["to"], message: "must be on or after from" })
  },
  defaulters: { query: z.object({ format }) },
  results: { query: z.object({ format, examId: id(), sectionId: id() }) }
};
