import { z } from "../../../../common/validation/zod.js";
import { id, idParams, text } from "../../../../common/validation/schemas.js";

export const feesValidators = {
  statement: { params: idParams("studentId"), query: z.object({ academicYearId: id().optional() }) },
  invoice: { params: idParams("studentId", "invoiceId") },
  confirm: { body: z.object({ orderId: text(100), paymentId: text(100), signature: text(256) }) },
  receipt: { params: idParams("paymentId") }
};
