import { and, between, desc, eq, inArray } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { publish } from "../../../../common/events/events.js";
import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { fromMinor, toMinor } from "../../../../common/money/money.js";
import { paymentGateway } from "../../../../common/payments/gateway.js";
import { logger } from "../../../../common/logging/logger.js";
import { getTenant } from "../../../../common/tenancy/tenant.service.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { creditService } from "../../credits/index.js";
import { invoiceService } from "../../invoices/index.js";
import { paymentSettingsService } from "../../payment-settings/index.js";
import { MIN_ONLINE_PAYMENT, OPEN_INVOICE_STATUSES } from "../../shared/constants/finance.constants.js";
import { nextReceiptNumber } from "../../shared/utils/codes.util.js";
import { payments } from "../models/payment.schema.js";
import { paymentRepository } from "../repositories/payment.repository.js";
import { refundService } from "./refund.service.js";

export const PAYMENT_RECEIVED = "finance.payment.received";

const withDetails = {
  invoice: {
    columns: {
      id: true,
      invoiceNumber: true,
      subtotal: true,
      discount: true,
      lateFee: true,
      total: true,
      amountPaid: true,
      balance: true,
      status: true
    }
  },
  student: {
    columns: { id: true, studentCode: true, admissionNumber: true },
    with: { user: { columns: { firstName: true, lastName: true } } }
  }
};

const money = amount => Number(amount).toFixed(2);

const assertPayable = invoice => {
  if (!invoice) throw notFound("Invoice");
  if (invoice.status === "CANCELLED") throw unprocessable("This invoice is cancelled");
  if (toMinor(invoice.balance) <= 0) throw unprocessable("This invoice is already fully paid");
};

const receiptNumberFor = async (tenantId, invoice, dbc) => {
  const year = await academicYearService.findById({ tenantId }, invoice.academicYearId);
  return nextReceiptNumber(tenantId, year.startDate, { dbc });
};

const announce = payment =>
  publish(PAYMENT_RECEIVED, {
    tenantId: payment.tenantId,
    paymentId: payment.id,
    invoiceId: payment.invoiceId,
    studentId: payment.studentId
  });

/* Mark a gateway payment as succeeded and apply it to the invoice, under the invoice's
   row lock. Two payments in flight can together exceed the balance: whatever is more
   than the balance at that moment (all of it, if the invoice was cancelled meanwhile)
   is kept as the student's credit, never added to the invoice. Safe to call twice
   (checkout callback and webhook both arrive): the second call is a no-op. */
/* expectedMinor: the amount the gateway reports (webhooks); a mismatch is never settled */
const settleGatewayPayment = async ({ tenantId, provider, orderId, gatewayPaymentId, expectedMinor }) => {
  const settled = await transaction(async tx => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenantId),
          eq(payments.isActive, true),
          eq(payments.gatewayProvider, provider),
          eq(payments.gatewayOrderId, orderId)
        )
      )
      .for("update");
    if (!payment) return null;
    if (payment.status === "SUCCEEDED") return { payment, fresh: false };
    if (expectedMinor !== undefined && expectedMinor !== toMinor(payment.amount)) {
      logger.warn(
        { tenantId, orderId, expectedMinor, orderMinor: toMinor(payment.amount) },
        "Gateway amount differs from the payment order; left pending for review"
      );
      return { payment, fresh: false, mismatch: true };
    }

    const invoice = await invoiceService.lockForUpdate(tenantId, payment.invoiceId, { dbc: tx });
    const open = OPEN_INVOICE_STATUSES.includes(invoice.status);
    const appliedMinor = open ? Math.min(toMinor(payment.amount), toMinor(invoice.balance)) : 0;
    const excess = fromMinor(toMinor(payment.amount) - appliedMinor);

    const [updated] = await tx
      .update(payments)
      .set({
        status: "SUCCEEDED",
        gatewayPaymentId,
        paidAt: new Date(),
        receiptNumber: await receiptNumberFor(tenantId, invoice, tx),
        excessAmount: excess,
        balanceAfter: open ? fromMinor(toMinor(invoice.balance) - appliedMinor) : 0
      })
      .where(eq(payments.id, payment.id))
      .returning();
    if (appliedMinor > 0) await invoiceService.applyPayment(tenantId, invoice, fromMinor(appliedMinor), { dbc: tx });
    if (toMinor(excess) > 0) {
      await creditService.addOverpayment(
        { tenantId },
        {
          studentId: payment.studentId,
          paymentId: payment.id,
          amount: excess,
          notes: open
            ? `${money(excess)} more than the balance of ${invoice.invoiceNumber}`
            : `${invoice.invoiceNumber} was ${invoice.status === "PAID" ? "already paid" : "cancelled"}`
        },
        { dbc: tx }
      );
    }
    return { payment: updated, fresh: true };
  });

  if (settled?.fresh) await announce(settled.payment);
  if (settled?.mismatch) return null;
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
          balanceAfter: fromMinor(toMinor(invoice.balance) - toMinor(amount)),
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

    await announce(payment);
    return paymentService.getById(ctx, payment.id);
  },

  /* Start an online payment with the school's own gateway keys -> checkout details.
     The payer chooses the amount, up to the balance (default: all of it), and at least
     MIN_ONLINE_PAYMENT unless that would be more than the balance (D-21). */
  createOnlineOrder: async (ctx, invoiceId, { amount } = {}) => {
    const invoice = await invoiceService.findById(ctx, invoiceId);
    if (!invoice) throw notFound("Invoice");
    const credentials = await paymentSettingsService.credentialsFor(ctx);
    assertPayable(invoice);

    const payMinor = amount === undefined ? toMinor(invoice.balance) : toMinor(amount);
    if (payMinor > toMinor(invoice.balance)) {
      throw unprocessable(`The amount exceeds the invoice balance of ${invoice.balance}`);
    }
    const minimumMinor = Math.min(toMinor(MIN_ONLINE_PAYMENT), toMinor(invoice.balance));
    if (payMinor < minimumMinor) {
      throw unprocessable(
        `The minimum online payment is ${money(MIN_ONLINE_PAYMENT)}, or the full balance of ${money(invoice.balance)}`
      );
    }

    const gateway = paymentGateway();
    const tenant = await getTenant(ctx.tenantId);
    const order = await gateway.createOrder(credentials, {
      amountMinor: payMinor,
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
      amount: payment.amount,
      amountMinor: order.amountMinor,
      currency: order.currency,
      invoiceNumber: invoice.invoiceNumber,
      invoiceBalance: invoice.balance
    };
  },

  /* Checkout callback: the browser/app sends what the gateway returned, verified with the school's key secret */
  confirmOnline: async (ctx, { orderId, paymentId, signature }) => {
    const credentials = await paymentSettingsService.credentialsFor(ctx);
    const gateway = paymentGateway();
    if (!gateway.verifyPayment(credentials, { orderId, paymentId, signature })) {
      throw unprocessable(
        "The payment could not be verified. If money was deducted, it will be confirmed automatically."
      );
    }
    const payment = await settleGatewayPayment({
      tenantId: ctx.tenantId,
      provider: gateway.name,
      orderId,
      gatewayPaymentId: paymentId
    });
    if (!payment) throw notFound("Payment order");
    return paymentService.getById(ctx, payment.id);
  },

  /* Gateway webhook for one school (no user): verified with that school's webhook secret */
  handleWebhook: async (tenantId, rawBody, signature) => {
    const credentials = await paymentSettingsService.credentialsFor({ tenantId });
    const gateway = paymentGateway();
    if (!gateway.verifyWebhook(credentials, rawBody, signature)) throw unprocessable("Invalid webhook signature");
    const event = gateway.parseWebhook(JSON.parse(rawBody.toString()));
    if (event?.refund) return refundService.fromGateway(tenantId, gateway.name, event.refund);
    if (!event?.captured) return { handled: false };
    /* Defence in depth: the captured amount and currency must be the order's */
    const school = await getTenant(tenantId);
    if (event.currency && school && event.currency !== school.currency) {
      logger.warn({ tenantId, orderId: event.orderId, currency: event.currency }, "Webhook currency differs; ignored");
      return { handled: false };
    }
    const payment = await settleGatewayPayment({
      tenantId,
      provider: gateway.name,
      orderId: event.orderId,
      gatewayPaymentId: event.paymentId,
      expectedMinor: Number.isInteger(event.amountMinor) ? event.amountMinor : undefined
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
