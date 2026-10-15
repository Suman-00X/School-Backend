import { z } from "../../../../common/validation/zod.js";
import { idParams, listQuery, nonNegativeInt, patchBody } from "../../../../common/validation/schemas.js";
import { employmentSchema, personSchema } from "../../shared/validators/person.validator.js";

const profileSchema = employmentSchema.extend({
  experienceYears: nonNegativeInt().max(60).optional()
});

const params = idParams("teacherId");

export const teacherValidators = {
  create: { body: z.object({ user: personSchema, profile: profileSchema.default({}) }) },
  list: { query: listQuery() },
  getById: { params },
  update: { params, body: patchBody(profileSchema) }
};
