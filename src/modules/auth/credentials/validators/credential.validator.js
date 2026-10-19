import { z } from "../../../../common/validation/zod.js";
import { password, schoolCode } from "../../shared/validators/password.validator.js";

export const credentialValidators = {
  invite: { body: z.object({ userIds: z.array(z.uuid()).min(1).max(500) }) },
  /* Without a school code, every school with an account for the email sends its own link */
  requestReset: { body: z.object({ email: z.email().max(254), schoolCode: schoolCode().optional() }) },
  reset: { body: z.object({ token: z.string().min(20).max(200), password: password() }) },
  change: { body: z.object({ currentPassword: z.string().min(1).max(128), newPassword: password() }) }
};
