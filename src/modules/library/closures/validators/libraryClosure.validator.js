import { z } from "../../../../common/validation/zod.js";
import { date, idParams, listQuery, text } from "../../../../common/validation/schemas.js";
import { daysBetween } from "../../../../common/utils/date.util.js";

export const libraryClosureValidators = {
  list: { query: listQuery({ from: date().optional(), to: date().optional() }) },
  create: {
    body: z
      .object({ fromDate: date(), toDate: date(), reason: text(200) })
      .refine(c => c.toDate >= c.fromDate, { path: ["toDate"], message: "must be on or after fromDate" })
      .refine(c => daysBetween(c.fromDate, c.toDate) <= 366, {
        path: ["toDate"],
        message: "must be within a year of fromDate"
      })
  },
  remove: { params: idParams("closureId") }
};
