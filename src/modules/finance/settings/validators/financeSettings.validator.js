import { z } from "../../../../common/validation/zod.js";

export const financeSettingsValidators = {
  update: {
    body: z
      .object({
        /* 0 turns it off: every refund needs an administrator */
        refundApprovalLimit: z.number().min(0).max(100_000_000).multipleOf(0.01)
      })
      .partial()
      .refine(body => Object.keys(body).length > 0, "Send at least one setting to change")
  }
};
