import { z } from "../../../../common/validation/zod.js";

export const operatorValidators = {
  login: {
    body: z.object({
      email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
      password: z.string().min(1).max(128)
    })
  }
};
