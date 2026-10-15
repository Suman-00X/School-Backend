import { z } from "../../../../common/validation/zod.js";
import { idParams, listQuery, optionalText, patchBody } from "../../../../common/validation/schemas.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";
import { employmentSchema, personSchema } from "../../shared/validators/person.validator.js";

const profileSchema = employmentSchema.extend({
  designation: optionalText(100),
  department: optionalText(100)
});

const params = idParams("staffId");

export const staffValidators = {
  create: {
    body: z.object({
      role: z.enum(ROLE_GROUPS.STAFF_ROLES),
      user: personSchema,
      profile: profileSchema.default({})
    })
  },
  list: { query: listQuery({ role: z.enum(ROLE_GROUPS.STAFF_ROLES).optional() }) },
  getById: { params },
  update: { params, body: patchBody(profileSchema) }
};
