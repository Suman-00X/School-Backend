import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText, text } from "../../../../common/validation/schemas.js";
import {
  OFFLINE_PAYMENT_METHODS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES
} from "../../shared/constants/finance.constants.js";
import { amount } from "../../shared/validators/finance.validators.js";

export const paymentValidators = {
  recordOffline: {
    params: idParams("invoiceId"),
    body: z
      .object({
        amount: amount(),
        method: z.enum(OFFLINE_PAYMENT_METHODS),
        reference: optionalText(100),
        paidAt: date().optional(),
        notes: optionalText(500)
      })
      .refine(p => p.method === "CASH" || p.reference, {
        path: ["reference"],
        message: "is required for non-cash payments"
      })
  },
  /* Online: any amount up to the balance (default: the whole balance) */
  createOrder: { params: idParams("invoiceId"), body: z.object({ amount: amount().optional() }) },
  confirm: { body: z.object({ orderId: text(100), paymentId: text(100), signature: text(256) }) },
  list: {
    query: listQuery({
      studentId: id().optional(),
      method: z.enum(PAYMENT_METHODS).optional(),
      status: z.enum(PAYMENT_STATUSES).optional(),
      from: date().optional(),
      to: date().optional()
    })
  },
  getById: { params: idParams("paymentId") },
  webhook: { params: idParams("tenantId") }
};
