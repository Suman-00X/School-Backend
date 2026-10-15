import { z } from "../../../../common/validation/zod.js";
import { idParams, listQuery, patchBody } from "../../../../common/validation/schemas.js";
import { ALL_ROLES } from "../../../../common/auth/roles.js";
import { USER_STATUSES } from "../../shared/constants/user.constants.js";
import { personSchema } from "../../shared/validators/person.validator.js";

const params = idParams("userId");

export const accountValidators = {
  list: {
    query: listQuery({
      role: z.enum(ALL_ROLES).optional(),
      status: z.enum(USER_STATUSES).optional()
    })
  },
  getById: { params },
  update: { params, body: patchBody(personSchema) },
  deactivate: { params }
};
