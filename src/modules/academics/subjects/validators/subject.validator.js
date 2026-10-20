import { z } from "../../../../common/validation/zod.js";
import {
  bulkBody,
  code,
  idParams,
  listQuery,
  name,
  optionalText,
  patchBody
} from "../../../../common/validation/schemas.js";
import { SUBJECT_TYPES } from "../../shared/constants/academic.constants.js";

export const subjectFields = z.object({
  subjectName: name(100),
  /* Stored upper-case: MA01, EN01, PHY-PR */
  subjectCode: code(/^[A-Z][A-Z0-9-]{1,9}$/, "must be 2-10 letters, digits or -, starting with a letter"),
  subjectType: z.enum(SUBJECT_TYPES).optional(),
  isOptional: z.boolean().optional(),
  description: optionalText()
});

const params = idParams("subjectId");

export const subjectValidators = {
  create: { body: subjectFields },
  createMany: {
    body: bulkBody("subjects", subjectFields, {
      unique: [
        { field: "subjectCode", key: s => s.subjectCode },
        { field: "subjectName", key: s => s.subjectName.toLowerCase() }
      ]
    })
  },
  list: { query: listQuery() },
  getById: { params },
  update: { params, body: patchBody(subjectFields) }
};
