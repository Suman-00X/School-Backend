import { z } from "../../../../common/validation/zod.js";
import { idParams } from "../../../../common/validation/schemas.js";
import { schoolCode } from "../../shared/validators/password.validator.js";

export const sessionValidators = {
  login: {
    body: z.object({
      schoolCode: schoolCode(),
      email: z.email().max(254),
      /* Not the policy here: an old password that predates the policy must still sign in */
      password: z.string().min(1).max(128)
    })
  },
  refresh: { body: z.object({ refreshToken: z.string().min(10).max(200) }) },
  revoke: { params: idParams("sessionId") }
};
