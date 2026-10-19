import { z } from "../../../../common/validation/zod.js";
import { date, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";

const fields = z.object({
  /* Derived from the dates: "2026-27", or "2026" within one calendar year. Optional;
     when sent it must equal the derived name (else 422) */
  yearName: text(20).optional(),
  startDate: date(),
  endDate: date(),
  isCurrent: z.boolean().default(false),
  weeklyOffDays: z
    .array(z.number().int().min(0).max(6))
    .max(6)
    .refine(days => new Set(days).size === days.length, "must not repeat a day")
    .optional(),
  /* Which Saturdays of the month are off: 1 = first … 5 = fifth, e.g. [2] or [2, 4] */
  offSaturdays: z
    .array(z.number().int().min(1).max(5))
    .max(5)
    .refine(weeks => new Set(weeks).size === weeks.length, "must not repeat a Saturday")
    .optional(),
  description: optionalText()
});

const params = idParams("academicYearId");

export const academicYearValidators = {
  create: {
    body: fields.refine(year => year.endDate > year.startDate, {
      path: ["endDate"],
      message: "must be after startDate"
    })
  },
  list: { query: listQuery() },
  getById: { params },
  update: { params, body: patchBody(fields.omit({ isCurrent: true }).extend({ isCurrent: z.boolean() })) }
};
