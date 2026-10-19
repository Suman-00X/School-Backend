import { z } from "../../../../common/validation/zod.js";
import { idParams, listQuery, name, optionalText, patchBody } from "../../../../common/validation/schemas.js";
import { GRADE_SCALE_TEMPLATE_KEYS } from "../../shared/constants/gradeScaleTemplates.constants.js";

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
  .refine(list => new Set(list.map(b => b.grade.toLowerCase())).size === list.length, "must not repeat a grade");

const fields = z.object({
  name: name(100),
  description: optionalText(),
  isDefault: z.boolean().optional(),
  bands
});

/* Explicit bands, or a copy of a template (name defaults to the template's) */
const createBody = fields
  .extend({
    name: name(100).optional(),
    bands: bands.optional(),
    templateKey: z.enum(GRADE_SCALE_TEMPLATE_KEYS).optional()
  })
  .refine(body => Boolean(body.templateKey) !== Boolean(body.bands), {
    path: ["bands"],
    message: "send either bands or templateKey"
  })
  .refine(body => body.templateKey || body.name, { path: ["name"], message: "is required" });

const params = idParams("gradeScaleId");

export const gradingValidators = {
  create: { body: createBody },
  templates: {},
  list: { query: listQuery() },
  getById: { params },
  update: { params, body: patchBody(fields) },
  remove: { params }
};
