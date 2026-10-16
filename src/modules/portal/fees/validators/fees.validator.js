import { z } from "../../../../common/validation/zod.js";
import { id, idParams, text } from "../../../../common/validation/schemas.js";

export const feesValidators = {
  statement: { params: idParams("studentId"), query: z.object({ academicYearId: id().optional() }) },
  invoice: { params: idParams("studentId", "invoiceId") },
  /* Pay part of the balance or all of it (default) */
  startPayment: {
    params: idParams("studentId", "invoiceId"),
    body: z.object({ amount: z.number().positive().max(100_000_000).multipleOf(0.01).optional() })
  },
  confirm: { body: z.object({ orderId: text(100), paymentId: text(100), signature: text(256) }) },
  receipt: { params: idParams("paymentId") },
  refundReceipt: { params: idParams("refundId") }
};
