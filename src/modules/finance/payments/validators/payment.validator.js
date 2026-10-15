import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText, text } from "../../../../common/validation/schemas.js";
import {
  OFFLINE_PAYMENT_METHODS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES
} from "../../shared/constants/finance.constants.js";

export const paymentValidators = {
  recordOffline: {
    params: idParams("invoiceId"),
    body: z
      .object({
        amount: z.number().positive().max(100_000_000).multipleOf(0.01),
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
  createOrder: { params: idParams("invoiceId") },
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
  getById: { params: idParams("paymentId") }
};
