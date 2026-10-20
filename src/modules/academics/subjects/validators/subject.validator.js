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
  /* Stored upper-case: MA, ENG, PHY. Letters only: a class subject's code adds three digits (MA221). */
  subjectCode: code(/^[A-Z]{2,6}$/, "must be 2-6 letters"),
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
