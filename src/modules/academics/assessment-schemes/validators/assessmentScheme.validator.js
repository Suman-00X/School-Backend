import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, name, optionalText, patchBody } from "../../../../common/validation/schemas.js";
import { onePolicy, previewPolicy } from "../../report-cards/index.js";

const exams = z
  .array(z.object({ examId: id(), weight: z.number().positive().max(100) }))
  .min(1)
  .max(12)
  .refine(items => new Set(items.map(i => i.examId)).size === items.length, "must not repeat an exam");

/* Teachers' own assessments (Teacher assessments 20%). `id` keeps an existing bucket and its items. */
const buckets = z
  .array(z.object({ id: id().optional(), name: name(60), weight: z.number().positive().max(100) }))
  .max(6)
  .refine(items => new Set(items.map(i => i.name.toLowerCase())).size === items.length, "must not repeat a name")
  .refine(items => new Set(items.filter(i => i.id).map(i => i.id)).size === items.filter(i => i.id).length, {
    message: "must not repeat a bucket"
  });

/* Exam and bucket weights, in hundredths */
export const weightTotal = ({ exams: e = [], buckets: b = [] }) =>
  Math.round([...e, ...b].reduce((total, i) => total + i.weight * 100, 0));

const fields = z.object({
  name: name(100),
  description: optionalText(),
  /* Own result policy; else the class's, the school default or the built-in rules */
  policyId: id().nullable().optional(),
  exams,
  buckets: buckets.optional()
});

const params = idParams("schemeId");
const version = () => z.coerce.number().int().positive();

export const assessmentSchemeValidators = {
  create: { body: fields.refine(body => weightTotal(body) === 10_000, { path: ["exams"], message: "weights must add up to 100" }) },
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
