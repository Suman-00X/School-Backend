import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { EXECUTED_REFUND_STATUSES } from "../../shared/constants/finance.constants.js";
import { payments } from "../models/payment.schema.js";
import { paymentRefunds } from "../models/paymentRefund.schema.js";

const base = createRepository({
  table: paymentRefunds,
  queryKey: "paymentRefunds",
  orderBy: desc(paymentRefunds.createdAt)
});

const lockOne = async (dbc, conditions) => {
  const [row] = await dbc
    .select()
    .from(payments)
    .where(and(...conditions))
    .for("update");
  return row ?? null;
};

export const paymentRefundRepository = {
  ...base,

  /* The payment row is the lock that serialises its refunds (and its settlement) */
  lockPayment: (tenantId, paymentId, { dbc }) => lockOne(dbc, [scoped(payments, tenantId, eq(payments.id, paymentId))]),

  lockPaymentByGatewayId: (tenantId, provider, gatewayPaymentId, { dbc }) =>
    lockOne(dbc, [
      scoped(
        payments,
        tenantId,
        eq(payments.gatewayProvider, provider),
        eq(payments.gatewayPaymentId, gatewayPaymentId)
      )
    ]),

  lockByGatewayRefundId: async (tenantId, provider, gatewayRefundId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(paymentRefunds)
      .where(
        scoped(
          paymentRefunds,
          tenantId,
          eq(paymentRefunds.gatewayProvider, provider),
          eq(paymentRefunds.gatewayRefundId, gatewayRefundId)
        )
      )
      .for("update");
    return row ?? null;
  },

  /* A refund, locked (after its payment: the payment lock comes first everywhere) */
  lockById: async (tenantId, refundId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(paymentRefunds)
      .where(scoped(paymentRefunds, tenantId, eq(paymentRefunds.id, refundId)))
      .for("update");
    return row ?? null;
  },

  /* Requests of a payment still waiting for approval, in paise */
  awaitingApproval: async (tenantId, paymentId, { dbc }) => {
    const [row] = await dbc
      .select({ amount: sql`coalesce(sum(${paymentRefunds.amount}), 0)`.mapWith(Number) })
      .from(paymentRefunds)
      .where(
        scoped(
          paymentRefunds,
          tenantId,
          eq(paymentRefunds.paymentId, paymentId),
          eq(paymentRefunds.status, "REQUESTED")
        )
      );
    return Math.round(row.amount * 100);
  },

  /* What a payment's executed refunds (processed or pending) took from its invoice and its credit, in paise */
  takenSoFar: async (tenantId, paymentId, { dbc }) => {
    const [row] = await dbc
      .select({
        fromInvoice: sql`coalesce(sum(${paymentRefunds.fromInvoice}), 0)`.mapWith(Number),
        fromCredit: sql`coalesce(sum(${paymentRefunds.fromCredit}), 0)`.mapWith(Number)
      })
      .from(paymentRefunds)
      .where(
        scoped(
          paymentRefunds,
          tenantId,
          eq(paymentRefunds.paymentId, paymentId),
          inArray(paymentRefunds.status, EXECUTED_REFUND_STATUSES)
        )
      );
    return { fromInvoice: Math.round(row.fromInvoice * 100), fromCredit: Math.round(row.fromCredit * 100) };
  },

  /* Keep payments.refunded_amount in step (never below 0 or above the payment) */
  addToPayment: (tenantId, paymentId, amount, { dbc }) =>
    dbc
      .update(payments)
      .set({
        refundedAmount: sql`least(${payments.amount}, greatest(0, ${payments.refundedAmount} + ${amount}))`,
        updatedAt: new Date()
      })
      .where(scoped(payments, tenantId, eq(payments.id, paymentId)))
};
