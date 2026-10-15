import { z } from "../../../../common/validation/zod.js";
import { bulkBody, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";
import { SUBJECT_TYPES } from "../../shared/constants/academic.constants.js";

const fields = z.object({
  subjectName: text(100),
  /* Stored upper-case: MA01, EN01 */
  subjectCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/, "must be 2-10 letters or digits"),
  subjectType: z.enum(SUBJECT_TYPES).optional(),
  isOptional: z.boolean().optional(),
  description: optionalText()
});

const params = idParams("subjectId");

export const subjectValidators = {
  create: { body: fields },
  createMany: { body: bulkBody("subjects", fields) },
  list: { query: listQuery() },
  getById: { params },
  update: { params, body: patchBody(fields) }
};
