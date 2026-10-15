import { z } from "../../../../common/validation/zod.js";
import { idParams, listQuery, optionalText, patchBody } from "../../../../common/validation/schemas.js";
import { personSchema } from "../../shared/validators/person.validator.js";

export const parentProfileSchema = z.object({
  occupation: optionalText(100),
  annualIncome: z.coerce.number().min(0).max(9_999_999_999).optional(),
  description: optionalText()
});

const params = idParams("parentId");

export const parentValidators = {
  create: { body: z.object({ user: personSchema, profile: parentProfileSchema.default({}) }) },
  list: { query: listQuery() },
  getById: { params },
  update: { params, body: patchBody(parentProfileSchema) }
};
