import { z } from "../../../../common/validation/zod.js";
import { date, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";

const fields = z.object({
  yearName: text(20),
  startDate: date(),
  endDate: date(),
  isCurrent: z.boolean().default(false),
  weeklyOffDays: z
    .array(z.number().int().min(0).max(6))
    .max(6)
    .refine(days => new Set(days).size === days.length, "must not repeat a day")
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
