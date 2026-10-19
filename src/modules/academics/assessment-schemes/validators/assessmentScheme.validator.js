import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, name, optionalText, patchBody } from "../../../../common/validation/schemas.js";
import { onePolicy, previewPolicy } from "../../report-cards/index.js";

const exams = z
  .array(z.object({ examId: id(), weight: z.number().positive().max(100) }))
  .min(1)
  .max(12)
  .refine(items => new Set(items.map(i => i.examId)).size === items.length, "must not repeat an exam")
  .refine(items => Math.round(items.reduce((total, i) => total + i.weight * 100, 0)) === 10_000, {
    message: "weights must add up to 100"
  });

const fields = z.object({
  name: name(100),
  description: optionalText(),
  /* Own result policy; else the class's, the school default or the built-in rules */
  policyId: id().nullable().optional(),
  exams
});

const params = idParams("schemeId");
const version = () => z.coerce.number().int().positive();

export const assessmentSchemeValidators = {
  create: { body: fields },
  list: { query: listQuery() },
  getById: { params },
  update: { params, body: patchBody(fields) },
  remove: { params },
  results: { params, query: z.object({ sectionId: id() }) },
  student: { params: idParams("schemeId", "studentId") },
  preview: {
    params,
    body: z.object({ sectionId: id().optional(), ...previewPolicy }).refine(...onePolicy)
  },
  publication: { params },
  versions: { params, query: listQuery() },
  integrity: { params: params.extend({ version: version() }) },
  comparison: { params, query: z.object({ sectionId: id().optional(), version: version().optional() }) }
};
