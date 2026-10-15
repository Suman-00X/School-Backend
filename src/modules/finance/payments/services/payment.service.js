import { and, between, desc, eq, inArray } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { publish } from "../../../../common/events/events.js";
import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { fromMinor, toMinor } from "../../../../common/money/money.js";
import { paymentGateway } from "../../../../common/payments/gateway.js";
import { getTenant } from "../../../../common/tenancy/tenant.service.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { invoiceService } from "../../invoices/index.js";
import { nextReceiptNumber } from "../../shared/utils/codes.util.js";
import { payments } from "../models/payment.schema.js";
import { paymentRepository } from "../repositories/payment.repository.js";

export const PAYMENT_RECEIVED = "finance.payment.received";

const withDetails = {
  invoice: { columns: { id: true, invoiceNumber: true, total: true, amountPaid: true, balance: true, status: true } },
  student: {
    columns: { id: true, studentCode: true, admissionNumber: true },
    with: { user: { columns: { firstName: true, lastName: true } } }
  }
};

const assertPayable = invoice => {
  if (!invoice) throw notFound("Invoice");
  if (invoice.status === "CANCELLED") throw unprocessable("This invoice is cancelled");
  if (toMinor(invoice.balance) <= 0) throw unprocessable("This invoice is already fully paid");
};

const receiptNumberFor = async (tenantId, invoice, dbc) => {
  const year = await academicYearService.findById({ tenantId }, invoice.academicYearId);
  return nextReceiptNumber(tenantId, year.startDate, { dbc });
};

/* Mark a gateway payment as succeeded and apply it to the invoice. Safe to call
   twice (checkout callback and webhook both arrive): the second call is a no-op. */
const settleGatewayPayment = async ({ provider, orderId, gatewayPaymentId, tenantId }) => {
  const settled = await transaction(async tx => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.gatewayProvider, provider),
          eq(payments.gatewayOrderId, orderId),
          tenantId ? eq(payments.tenantId, tenantId) : undefined
        )
      )
      .for("update");
    if (!payment) return null;
    if (payment.status === "SUCCEEDED") return { payment, fresh: false };

    const invoice = await invoiceService.lockForUpdate(payment.tenantId, payment.invoiceId, { dbc: tx });
    const [updated] = await tx
      .update(payments)
      .set({
        status: "SUCCEEDED",
        gatewayPaymentId,
        paidAt: new Date(),
        receiptNumber: await receiptNumberFor(payment.tenantId, invoice, tx)
      })
      .where(eq(payments.id, payment.id))
      .returning();
    await invoiceService.applyPayment(payment.tenantId, invoice, payment.amount, { dbc: tx });
    return { payment: updated, fresh: true };
  });

  if (settled?.fresh) {
    const { payment } = settled;
    await publish(PAYMENT_RECEIVED, {
      tenantId: payment.tenantId,
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      studentId: payment.studentId
    });
  }
  return settled?.payment ?? null;
};

export const paymentService = {
  /* Fees collected at the counter (cash, cheque, UPI, card, bank transfer) */
  recordOffline: async (ctx, invoiceId, { amount, method, reference, paidAt, notes }) => {
    const payment = await transaction(async tx => {
      const invoice = await invoiceService.lockForUpdate(ctx.tenantId, invoiceId, { dbc: tx });
      assertPayable(invoice);
      if (toMinor(amount) > toMinor(invoice.balance)) {
        throw unprocessable(`The amount exceeds the invoice balance of ${invoice.balance}`);
      }
      const created = await paymentRepository.create(
        ctx.tenantId,
        {
          invoiceId,
          studentId: invoice.studentId,
          amount,
          method,
          status: "SUCCEEDED",
          receiptNumber: await receiptNumberFor(ctx.tenantId, invoice, tx),
          paidAt: paidAt ? new Date(paidAt) : new Date(),
          reference,
          receivedBy: ctx.userId,
          notes
        },
        { dbc: tx }
      );
      await invoiceService.applyPayment(ctx.tenantId, invoice, amount, { dbc: tx });
      return created;
    });

    await publish(PAYMENT_RECEIVED, {
      tenantId: ctx.tenantId,
      paymentId: payment.id,
      invoiceId,
      studentId: payment.studentId
    });
    return paymentService.getById(ctx, payment.id);
  },

  /* Start an online payment for the invoice's full balance -> checkout details */
  createOnlineOrder: async (ctx, invoiceId) => {
    const invoice = await invoiceService.findById(ctx, invoiceId);
    assertPayable(invoice);
    const gateway = paymentGateway();
    const tenant = await getTenant(ctx.tenantId);

    const order = await gateway.createOrder({
      amountMinor: toMinor(invoice.balance),
      currency: tenant?.currency ?? "INR",
      receipt: invoice.invoiceNumber,
      notes: { tenantId: ctx.tenantId, invoiceId }
    });
    const payment = await paymentRepository.create(ctx.tenantId, {
      invoiceId,
      studentId: invoice.studentId,
      amount: fromMinor(order.amountMinor),
      method: "ONLINE",
      status: "PENDING",
      gatewayProvider: gateway.name,
      gatewayOrderId: order.orderId,
      receivedBy: ctx.userId
    });
    return {
      paymentId: payment.id,
      provider: gateway.name,
      orderId: order.orderId,
      keyId: order.keyId,
      amountMinor: order.amountMinor,
      currency: order.currency,
      invoiceNumber: invoice.invoiceNumber
    };
  },

  /* Checkout callback: the browser/app sends what the gateway returned */
  confirmOnline: async (ctx, { orderId, paymentId, signature }) => {
    const gateway = paymentGateway();
    if (!gateway.verifyPayment({ orderId, paymentId, signature })) {
      throw unprocessable(
        "The payment could not be verified. If money was deducted, it will be confirmed automatically."
      );
    }
    const payment = await settleGatewayPayment({
      provider: gateway.name,
      orderId,
      gatewayPaymentId: paymentId,
      tenantId: ctx.tenantId
    });
    if (!payment) throw notFound("Payment order");
    return paymentService.getById(ctx, payment.id);
  },

  /* Gateway webhook (no user, no tenant in the request: the order decides) */
  handleWebhook: async (rawBody, signature) => {
    const gateway = paymentGateway();
    if (!rawBody || !gateway.verifyWebhook(rawBody, signature)) throw unprocessable("Invalid webhook signature");
    const event = gateway.parseWebhook(JSON.parse(rawBody.toString()));
    if (!event?.captured) return { handled: false };
    const payment = await settleGatewayPayment({
      provider: gateway.name,
      orderId: event.orderId,
      gatewayPaymentId: event.paymentId
    });
    return { handled: Boolean(payment) };
  },

  list: (ctx, { page, limit, studentId, method, status, from, to }) =>
    paymentRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withDetails,
      orderBy: desc(payments.paidAt),
      conditions: [
        studentId && eq(payments.studentId, studentId),
        method && eq(payments.method, method),
        status && eq(payments.status, status),
        from && to && between(payments.paidAt, new Date(`${from}T00:00:00Z`), new Date(`${to}T23:59:59Z`))
      ].filter(Boolean)
    }),

  getById: async (ctx, paymentId) => {
    const payment = await paymentRepository.findById(ctx.tenantId, paymentId, { with: withDetails });
    if (!payment) throw notFound("Payment");
    return payment;
  },

  /* For other submodules */
  forInvoice: (ctx, invoiceId) =>
    paymentRepository.findMany(ctx.tenantId, {
      conditions: [eq(payments.invoiceId, invoiceId)],
      orderBy: desc(payments.createdAt)
    }),

  forStudent: (ctx, studentId, invoiceIds) =>
    invoiceIds.length
      ? paymentRepository.findMany(ctx.tenantId, {
          conditions: [
            eq(payments.studentId, studentId),
            eq(payments.status, "SUCCEEDED"),
            inArray(payments.invoiceId, invoiceIds)
          ],
          orderBy: desc(payments.paidAt)
        })
      : []
};
