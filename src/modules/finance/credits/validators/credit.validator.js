import { z } from "../../../../common/validation/zod.js";
import { idParams, optionalText } from "../../../../common/validation/schemas.js";
import { OFFLINE_PAYMENT_METHODS } from "../../shared/constants/finance.constants.js";
import { amount } from "../../shared/validators/finance.validators.js";

export const creditValidators = {
  forStudent: { params: idParams("studentId") },
  /* amount omitted: as much as the credit and the invoice balance allow */
  apply: { params: idParams("invoiceId"), body: z.object({ amount: amount().optional() }) },
  refund: {
    params: idParams("studentId"),
    body: z
      .object({
        amount: amount(),
        method: z.enum(OFFLINE_PAYMENT_METHODS),
        reference: optionalText(100),
        notes: optionalText(500)
      })
      .refine(r => r.method === "CASH" || r.reference, {
        path: ["reference"],
        message: "is required for non-cash refunds"
      })
  }
};
