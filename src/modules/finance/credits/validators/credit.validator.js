import { z } from "../../../../common/validation/zod.js";
import { idParams } from "../../../../common/validation/schemas.js";
import { amount } from "../../shared/validators/finance.validators.js";

export const creditValidators = {
  forStudent: { params: idParams("studentId") },
  /* amount omitted: as much as the credit and the invoice balance allow */
  apply: { params: idParams("invoiceId"), body: z.object({ amount: amount().optional() }) }
};
