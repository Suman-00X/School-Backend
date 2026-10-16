import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText, text } from "../../../../common/validation/schemas.js";
import {
  OFFLINE_PAYMENT_METHODS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  REFUND_METHODS,
  REFUND_STATUSES
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
  webhook: { params: idParams("tenantId") },

  /* Default amount: everything still refundable */
  refund: {
    params: idParams("paymentId"),
    body: z
      .object({
        amount: amount().optional(),
        method: z.enum(REFUND_METHODS).optional(),
        reason: text(500),
        reference: optionalText(100)
      })
      .refine(r => !r.method || ["ORIGINAL", "CASH"].includes(r.method) || r.reference, {
        path: ["reference"],
        message: "is required when paying back by cheque, UPI or bank transfer"
      })
  },
  listRefunds: {
    query: listQuery({
      studentId: id().optional(),
      paymentId: id().optional(),
      status: z.enum(REFUND_STATUSES).optional(),
      /* Gateway refunds the books could not fully cover */
      needsReview: z
        .enum(["true", "false"])
        .transform(v => v === "true")
        .optional(),
      from: date().optional(),
      to: date().optional()
    })
  },
  getRefund: { params: idParams("refundId") }
};
