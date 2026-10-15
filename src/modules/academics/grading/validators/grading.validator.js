import { z } from "../../../../common/validation/zod.js";
import { idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";

const percent = () => z.number().min(0).max(100);

const band = z
  .object({
    grade: z.string().trim().min(1).max(5),
    minPercent: percent(),
    maxPercent: percent(),
    gradePoint: z.number().min(0).max(10).optional(),
    remark: optionalText(100),
    isPassing: z.boolean().default(true)
  })
  .refine(b => b.maxPercent > b.minPercent, { path: ["maxPercent"], message: "must be greater than minPercent" });

const bands = z
  .array(band)
  .min(2)
  .max(20)
  .refine(list => new Set(list.map(b => b.grade)).size === list.length, "must not repeat a grade");

const fields = z.object({
  name: text(100),
  description: optionalText(),
  isDefault: z.boolean().optional(),
  bands
});

const params = idParams("gradeScaleId");

export const gradingValidators = {
  create: { body: fields },
  list: { query: listQuery() },
  getById: { params },
  update: { params, body: patchBody(fields) },
  remove: { params }
};
