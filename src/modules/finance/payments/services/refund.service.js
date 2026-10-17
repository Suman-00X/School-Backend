import { and, between, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { ROLES } from "../../../../common/auth/roles.js";
import { transaction } from "../../../../common/database/postgres.js";
import { publish } from "../../../../common/events/events.js";
import { conflict, forbidden, notFound, unprocessable } from "../../../../common/http/errors.js";
import { logger } from "../../../../common/logging/logger.js";
import { fromMinor, toMinor } from "../../../../common/money/money.js";
import { paymentGateway } from "../../../../common/payments/gateway.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { studentService } from "../../../users/students/index.js";
import { creditService } from "../../credits/index.js";
import { invoiceService } from "../../invoices/index.js";
import { financePostings } from "../../ledger/index.js";
import { paymentSettingsService } from "../../payment-settings/index.js";
import { financeSettingsService } from "../../settings/index.js";
import { EXECUTED_REFUND_STATUSES } from "../../shared/constants/finance.constants.js";
import { nextRefundNumber } from "../../shared/utils/codes.util.js";
import { paymentRefunds } from "../models/paymentRefund.schema.js";
import { paymentRefundRepository as refunds } from "../repositories/paymentRefund.repository.js";

export const REFUND_PROCESSED = "finance.refund.processed";
/* A request waits for an administrator */
export const REFUND_REQUESTED = "finance.refund.requested";
/* An administrator approved or rejected someone else's request */
export const REFUND_DECIDED = "finance.refund.decided";

const money = minor => (minor / 100).toFixed(2);

/* How a refund is named in messages: its number once executed, else what it is */
export const refundLabel = refund =>
  refund.refundNumber
    ? `Refund ${refund.refundNumber}`
    : `The refund request of ${Number(refund.amount).toFixed(2)}${refund.paymentId ? "" : " from the student's credit"}`;

const person = { columns: { id: true, firstName: true, lastName: true, role: true } };

const withDetails = {
  payment: {
    columns: {
      id: true,
      receiptNumber: true,
      method: true,
      amount: true,
      refundedAmount: true,
      paidAt: true,
      reference: true
    }
  },
  invoice: { columns: { id: true, invoiceNumber: true, total: true, amountPaid: true, balance: true, status: true } },
  student: {
    columns: { id: true, studentCode: true, admissionNumber: true },
    with: { user: { columns: { firstName: true, lastName: true } } }
  },
  requester: person,
  approver: person,
  rejecter: person
};

const refundableOf = payment => toMinor(payment.amount) - toMinor(payment.refundedAmount);

/* How the money goes back: through the gateway (ORIGINAL, the default for online payments) or by hand */
const methodFor = (payment, method) => {
  const online = payment.method === "ONLINE";
  const how = method ?? (online ? "ORIGINAL" : null);
  if (!how) throw unprocessable("method is required: how is the money paid back (CASH, BANK_TRANSFER…)?");
  if (how === "ORIGINAL" && !online)
    throw unprocessable("ORIGINAL is only for online payments; choose how it is paid back");
  return how;
};

/* Split a refund over the payment's leftover credit (first) and what it paid on its
   invoice. -> { fromCredit, fromInvoice, unallocated } in paise */
const allocate = async (ctx, tx, payment, invoice, amountMinor) => {
  const taken = await refunds.takenSoFar(ctx.tenantId, payment.id, { dbc: tx });
  const creditOfPayment = toMinor(payment.excessAmount) - taken.fromCredit;
  const creditAvailable = toMinor(await creditService.balance(ctx, payment.studentId, { dbc: tx }));
  const fromCredit = Math.max(0, Math.min(amountMinor, creditOfPayment, creditAvailable));
  const paidOnInvoice = toMinor(payment.amount) - toMinor(payment.excessAmount) - taken.fromInvoice;
  const fromInvoice = Math.max(0, Math.min(amountMinor - fromCredit, paidOnInvoice, toMinor(invoice.amountPaid)));
  return { fromCredit, fromInvoice, unallocated: amountMinor - fromCredit - fromInvoice };
};

const coverable = (split, amountMinor) => {
  if (split.unallocated > 0) {
    throw unprocessable(
      `Only ${money(amountMinor - split.unallocated)} can be refunded now: the rest of this payment's credit was already used on other invoices`
    );
  }
};

/* Move the money: off the invoice and the credit, onto the payment's refunded total */
const applyEffects = async (ctx, tx, { payment, invoice, refundNumber, amountMinor, split }) => {
  if (split.fromCredit > 0) {
    const remaining = await creditService.takeForRefund(
      ctx,
      { studentId: payment.studentId, paymentId: payment.id, amount: fromMinor(split.fromCredit), notes: refundNumber },
      { dbc: tx }
    );
    /* The credit was spent by a concurrent request after it was read: retry */
    if (remaining === null) throw conflict("The student's credit changed while refunding. Please try again.");
  }
  if (split.fromInvoice > 0)
    await invoiceService.removePayment(ctx.tenantId, invoice, fromMinor(split.fromInvoice), { dbc: tx });
  await refunds.addToPayment(ctx.tenantId, payment.id, fromMinor(amountMinor), { dbc: tx });
};

/* Execute an approved request, under its payment's row lock: re-check what can still go
   back (other refunds, a dashboard refund or spent credit may have changed it since the
   request), pay it out (through the gateway for ORIGINAL), move the money, post it to the
   ledger. A gateway refusal rolls everything back and leaves the request waiting. */
const execute = async (ctx, tx, { refund, payment }, approval) => {
  if (!payment) return executeCredit(ctx, tx, refund, approval);
  if (payment.status !== "SUCCEEDED") throw unprocessable("Only a successful payment can be refunded");
  const amountMinor = toMinor(refund.amount);
  const refundableMinor = refundableOf(payment);
  if (amountMinor > refundableMinor) {
    throw unprocessable(
      (refundableMinor > 0
        ? `Only ${money(refundableMinor)} of payment ${payment.receiptNumber} can still be refunded`
        : `Payment ${payment.receiptNumber} has already been refunded in full`) +
        "; reject this request and request again if needed"
    );
  }
  const invoice = await invoiceService.lockForUpdate(ctx.tenantId, payment.invoiceId, { dbc: tx });
  const split = await allocate(ctx, tx, payment, invoice, amountMinor);
  coverable(split, amountMinor);
  /* Numbered now, so rejected requests leave no gaps; a gateway refusal rolls the number back too */
  const refundNumber = await refundNumberFor(ctx, invoice, tx);

  let gateway = null;
  if (refund.method === "ORIGINAL") {
    const credentials = await paymentSettingsService.credentialsFor(ctx);
    try {
      gateway = await paymentGateway().refund(credentials, {
        paymentId: payment.gatewayPaymentId,
        amountMinor,
        notes: { refundNumber, reason: refund.reason ?? "" }
      });
    } catch (error) {
      logger.warn({ err: error, refundId: refund.id }, "Gateway refund failed");
      throw unprocessable(
        `The payment gateway did not accept the refund${error.gatewayMessage ? `: ${error.gatewayMessage}` : ""}`
      );
    }
    if (gateway.status === "FAILED") throw unprocessable("The payment gateway rejected the refund");
  }

  const status = gateway?.status ?? "PROCESSED";
  const now = new Date();
  const executed = await refunds.update(
    ctx.tenantId,
    refund.id,
    {
      status,
      refundNumber,
      fromInvoice: fromMinor(split.fromInvoice),
      fromCredit: fromMinor(split.fromCredit),
      unallocated: 0,
      gatewayProvider: gateway ? paymentGateway().name : null,
      gatewayRefundId: gateway?.refundId ?? null,
      ...approvalOf(ctx, approval, now),
      processedAt: status === "PROCESSED" ? now : null
    },
    { dbc: tx }
  );
  await applyEffects(ctx, tx, { payment, invoice, refundNumber, amountMinor, split });
  await financePostings.refundExecuted(ctx, { refund: executed, receiptNumber: payment.receiptNumber }, { dbc: tx });
  return executed;
};

const approvalOf = (ctx, approval, now) => ({
  approvedBy: ctx.userId,
  approvedAt: now,
  autoApproved: Boolean(approval?.autoApproved)
});

/* Execute an approved refund of a student's credit (no payment): take it off the credit,
   number it, post it. The credit may have been used since the request. */
const executeCredit = async (ctx, tx, refund, approval) => {
  await refunds.lockStudentCredit(ctx.tenantId, refund.studentId, { dbc: tx });
  const refundNumber = await refundNumberFor(ctx, null, tx);
  const remaining = await creditService.takeForRefund(
    ctx,
    { studentId: refund.studentId, paymentId: null, amount: refund.amount, notes: refundNumber },
    { dbc: tx }
  );
  if (remaining === null) {
    const left = await creditService.balance(ctx, refund.studentId, { dbc: tx });
    throw unprocessable(
      `Only ${Number(left).toFixed(2)} of the student's credit is left; reject this request and request again if needed`
    );
  }
  const now = new Date();
  const executed = await refunds.update(
    ctx.tenantId,
    refund.id,
    { status: "PROCESSED", refundNumber, ...approvalOf(ctx, approval, now), processedAt: now },
    { dbc: tx }
  );
  await financePostings.refundExecuted(ctx, { refund: executed, receiptNumber: null }, { dbc: tx });
  return executed;
};

/* An accountant's refund within the school's approval limit needs no administrator. The
   limit counts everything it already let through on the same payment (or credit). */
const withinApprovalLimit = async (ctx, tx, { paymentId, studentId, amountMinor }) => {
  if (ctx.role === ROLES.ADMIN) return false;
  const limitMinor = toMinor(await financeSettingsService.refundApprovalLimit(ctx, { dbc: tx }));
  if (limitMinor <= 0) return false;
  const soFar = await refunds.autoApprovedSoFar(ctx.tenantId, { paymentId, studentId }, { dbc: tx });
  return soFar + amountMinor <= limitMinor;
};

/* A failed gateway refund: put everything back (any part the invoice no longer needs becomes credit) */
const reverse = async (ctx, tx, refund) => {
  const invoice = await invoiceService.lockForUpdate(ctx.tenantId, refund.invoiceId, { dbc: tx });
  const backOnInvoice = Math.min(toMinor(refund.fromInvoice), Math.max(0, toMinor(invoice.balance)));
  if (backOnInvoice > 0)
    await invoiceService.applyPayment(ctx.tenantId, invoice, fromMinor(backOnInvoice), { dbc: tx });
  const toCredit = toMinor(refund.fromCredit) + toMinor(refund.fromInvoice) - backOnInvoice;
  if (toCredit > 0) {
    await creditService.restoreFromFailedRefund(
      ctx,
      {
        studentId: refund.studentId,
        paymentId: refund.paymentId,
        amount: fromMinor(toCredit),
        notes: `${refund.refundNumber} failed`
      },
      { dbc: tx }
    );
  }
  await refunds.addToPayment(ctx.tenantId, refund.paymentId, -Number(refund.amount), { dbc: tx });
  await financePostings.refundFailed(
    ctx,
    { refund, backOnInvoiceMinor: backOnInvoice, toCreditMinor: toCredit },
    { dbc: tx }
  );
  return refunds.update(ctx.tenantId, refund.id, { status: "FAILED", failedAt: new Date() }, { dbc: tx });
};

/* Numbered by the invoice's academic year; a credit refund by the current year (or today) */
const refundNumberFor = async (ctx, invoice, tx) => {
  const year = invoice
    ? await academicYearService.findById(ctx, invoice.academicYearId)
    : await academicYearService.findCurrent(ctx);
  return nextRefundNumber(ctx.tenantId, year?.startDate ?? (await tenantToday(ctx.tenantId)), { dbc: tx });
};

const notice = refund => ({
  tenantId: refund.tenantId,
  refundId: refund.id,
  paymentId: refund.paymentId,
  invoiceId: refund.invoiceId,
  studentId: refund.studentId
});

const announce = refund => publish(REFUND_PROCESSED, notice(refund));

/* A request and its payment, both locked (payment first, as every refund path does; a
   credit refund locks the student's credit instead) */
const lockRequest = async (ctx, refundId, tx) => {
  const found = await refunds.findById(ctx.tenantId, refundId, { dbc: tx });
  if (!found) throw notFound("Refund");
  const payment = found.paymentId ? await refunds.lockPayment(ctx.tenantId, found.paymentId, { dbc: tx }) : null;
  if (!found.paymentId) await refunds.lockStudentCredit(ctx.tenantId, found.studentId, { dbc: tx });
  const refund = await refunds.lockById(ctx.tenantId, refundId, { dbc: tx });
  if (refund.status !== "REQUESTED") {
    throw conflict(
      refund.status === "REJECTED"
        ? `${refundLabel(refund)} was rejected`
        : `${refundLabel(refund)} was already approved (${refund.status.toLowerCase()})`
    );
  }
  return { refund, payment };
};

const afterCreate = async refund => {
  if (refund.status === "REQUESTED") await publish(REFUND_REQUESTED, notice(refund));
  if (refund.status === "PROCESSED") await announce(refund);
};

export const refundService = {
  /* Staff: refund (part of) a successful payment. Online payments go back through the
     school's gateway account (method ORIGINAL); others are paid back by hand and recorded.
     It is a request until an administrator other than the requester approves it. An
     accountant's refund within the school's approval limit is approved at once. Requests
     already waiting on the same payment are set aside, so together they never exceed what
     it can refund. */
  create: async (ctx, paymentId, { amount, method, reason, reference }) => {
    const refund = await transaction(async tx => {
      const payment = await refunds.lockPayment(ctx.tenantId, paymentId, { dbc: tx });
      if (!payment) throw notFound("Payment");
      if (payment.status !== "SUCCEEDED") throw unprocessable("Only a successful payment can be refunded");

      const refundableMinor = refundableOf(payment);
      if (refundableMinor <= 0) throw conflict(`Payment ${payment.receiptNumber} has already been refunded in full`);
      const waitingMinor = await refunds.awaitingApproval(ctx.tenantId, paymentId, { dbc: tx });
      const availableMinor = refundableMinor - waitingMinor;
      if (availableMinor <= 0) {
        throw conflict(
          `The rest of payment ${payment.receiptNumber} (${money(waitingMinor)}) is already waiting for approval`
        );
      }
      const amountMinor = amount === undefined ? availableMinor : toMinor(amount);
      if (amountMinor > availableMinor) {
        throw unprocessable(
          `At most ${money(availableMinor)} of payment ${payment.receiptNumber} can still be refunded` +
            (waitingMinor > 0 ? ` (${money(waitingMinor)} more is waiting for approval)` : "")
        );
      }
      const how = methodFor(payment, method);

      /* The planned split; the approval recomputes it */
      const invoice = await invoiceService.lockForUpdate(ctx.tenantId, payment.invoiceId, { dbc: tx });
      const split = await allocate(ctx, tx, payment, invoice, amountMinor);
      coverable(split, amountMinor);

      const requested = await refunds.create(
        ctx.tenantId,
        {
          paymentId,
          invoiceId: payment.invoiceId,
          studentId: payment.studentId,
          amount: fromMinor(amountMinor),
          fromInvoice: fromMinor(split.fromInvoice),
          fromCredit: fromMinor(split.fromCredit),
          unallocated: 0,
          method: how,
          status: "REQUESTED",
          source: "STAFF",
          reason,
          reference,
          requestedBy: ctx.userId
        },
        { dbc: tx }
      );
      return (await withinApprovalLimit(ctx, tx, { paymentId, amountMinor }))
        ? execute(ctx, tx, { refund: requested, payment }, { autoApproved: true })
        : requested;
    });
    await afterCreate(refund);
    return refundService.getById(ctx, refund.id);
  },

  /* Staff: pay a student's credit back to the family (cash, cheque, UPI, bank transfer).
     The same procedure as any refund: a request, approved by an administrator other than
     the requester (or by the approval limit), numbered, with a receipt and ledger entry.
     Credit the family keeps stays with the school for later fees. */
  requestCreditRefund: async (ctx, studentId, { amount, method, reason, reference }) => {
    if (!(await studentService.exists(ctx, studentId))) throw notFound("Student");
    const refund = await transaction(async tx => {
      await refunds.lockStudentCredit(ctx.tenantId, studentId, { dbc: tx });
      const balanceMinor = toMinor(await creditService.balance(ctx, studentId, { dbc: tx }));
      const waitingMinor = await refunds.awaitingCreditApproval(ctx.tenantId, studentId, { dbc: tx });
      const availableMinor = balanceMinor - waitingMinor;
      if (balanceMinor <= 0) throw unprocessable("The student has no credit to pay back");
      if (availableMinor <= 0)
        throw conflict(`All of the student's credit (${money(waitingMinor)}) is already waiting for approval`);
      const amountMinor = amount === undefined ? availableMinor : toMinor(amount);
      if (amountMinor > availableMinor) {
        throw unprocessable(
          `At most ${money(availableMinor)} of the student's credit can be paid back` +
            (waitingMinor > 0 ? ` (${money(waitingMinor)} more is waiting for approval)` : "")
        );
      }
      const requested = await refunds.create(
        ctx.tenantId,
        {
          paymentId: null,
          invoiceId: null,
          studentId,
          amount: fromMinor(amountMinor),
          fromInvoice: 0,
          fromCredit: fromMinor(amountMinor),
          unallocated: 0,
          method,
          status: "REQUESTED",
          source: "STAFF",
          reason,
          reference,
          requestedBy: ctx.userId
        },
        { dbc: tx }
      );
      return (await withinApprovalLimit(ctx, tx, { studentId, amountMinor }))
        ? execute(ctx, tx, { refund: requested, payment: null }, { autoApproved: true })
        : requested;
    });
    await afterCreate(refund);
    return refundService.getById(ctx, refund.id);
  },

  /* Administrator: approve someone else's request, which executes it (exactly once, under
     the payment's lock). Nobody approves their own. */
  approve: async (ctx, refundId) => {
    const refund = await transaction(async tx => {
      const request = await lockRequest(ctx, refundId, tx);
      if (request.refund.requestedBy === ctx.userId)
        throw forbidden("You asked for this refund, so another administrator must approve it");
      return execute(ctx, tx, request);
    });
    await publish(REFUND_DECIDED, notice(refund));
    if (refund.status === "PROCESSED") await announce(refund);
    return refundService.getById(ctx, refundId);
  },

  /* Administrator: decline a request; no money moves */
  reject: async (ctx, refundId, { reason }) => {
    const refund = await transaction(async tx => {
      const { refund: request } = await lockRequest(ctx, refundId, tx);
      return refunds.update(
        ctx.tenantId,
        request.id,
        { status: "REJECTED", rejectedBy: ctx.userId, rejectedAt: new Date(), rejectionReason: reason },
        { dbc: tx }
      );
    });
    await publish(REFUND_DECIDED, notice(refund));
    return refundService.getById(ctx, refundId);
  },

  /* Webhook: a refund the gateway reports (made here, or in the gateway's dashboard).
     Dashboard refunds already happened, so they are recorded without approval. */
  fromGateway: async (tenantId, provider, { refundId, paymentId, amountMinor, status }) => {
    const ctx = { tenantId, role: "SYSTEM" };
    const outcome = await transaction(async tx => {
      const payment = await refunds.lockPaymentByGatewayId(tenantId, provider, paymentId, { dbc: tx });
      if (!payment) return { handled: false };
      const existing = await refunds.lockByGatewayRefundId(tenantId, provider, refundId, { dbc: tx });

      if (existing) {
        if (status === "FAILED" && EXECUTED_REFUND_STATUSES.includes(existing.status))
          return { handled: true, refund: await reverse(ctx, tx, existing) };
        if (status === "PROCESSED" && existing.status === "PENDING") {
          const refund = await refunds.update(
            tenantId,
            existing.id,
            { status: "PROCESSED", processedAt: new Date() },
            { dbc: tx }
          );
          return { handled: true, refund, announce: true };
        }
        return { handled: true, refund: existing };
      }
      if (status === "FAILED") return { handled: false };

      /* Made outside this system (the gateway's dashboard): record it and move the money */
      const invoice = await invoiceService.lockForUpdate(tenantId, payment.invoiceId, { dbc: tx });
      const split = await allocate(ctx, tx, payment, invoice, amountMinor);
      const refundNumber = await refundNumberFor(ctx, invoice, tx);
      if (split.unallocated > 0) {
        logger.warn(
          { tenantId, refundId, unallocated: split.unallocated },
          "Gateway refund larger than the books can cover"
        );
      }
      const refund = await refunds.create(
        tenantId,
        {
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          studentId: payment.studentId,
          refundNumber,
          amount: fromMinor(amountMinor),
          fromInvoice: fromMinor(split.fromInvoice),
          fromCredit: fromMinor(split.fromCredit),
          unallocated: fromMinor(split.unallocated),
          method: "ORIGINAL",
          status,
          source: "GATEWAY",
          reason: "Refunded in the payment gateway's dashboard",
          gatewayProvider: provider,
          gatewayRefundId: refundId,
          processedAt: status === "PROCESSED" ? new Date() : null
        },
        { dbc: tx }
      );
      await applyEffects(ctx, tx, { payment, invoice, refundNumber, amountMinor, split });
      await financePostings.refundExecuted(ctx, { refund, receiptNumber: payment.receiptNumber }, { dbc: tx });
      return { handled: true, refund, announce: status === "PROCESSED" };
    });
    if (outcome.announce) await announce(outcome.refund);
    return { handled: outcome.handled };
  },

  list: (ctx, { page, limit, studentId, paymentId, status, needsReview, creditOnly, from, to }) =>
    refunds.list(ctx.tenantId, {
      page,
      limit,
      with: withDetails,
      conditions: [
        studentId && eq(paymentRefunds.studentId, studentId),
        paymentId && eq(paymentRefunds.paymentId, paymentId),
        creditOnly && isNull(paymentRefunds.paymentId),
        status && eq(paymentRefunds.status, status),
        needsReview && and(eq(paymentRefunds.source, "GATEWAY"), sql`${paymentRefunds.unallocated} > 0`),
        from && to && between(paymentRefunds.createdAt, new Date(from), new Date(`${to}T23:59:59.999Z`))
      ].filter(Boolean)
    }),

  getById: async (ctx, refundId) => {
    const refund = await refunds.findById(ctx.tenantId, refundId, { with: withDetails });
    if (!refund) throw notFound("Refund");
    return refund;
  },

  /* For statements: refunds of the year's invoices, and refunds of the student's credit
     requested in the year (credit has no invoice, so no year of its own) */
  forStatement: (ctx, studentId, { invoiceIds, from, to }) =>
    refunds.findMany(ctx.tenantId, {
      conditions: [
        or(
          invoiceIds.length ? inArray(paymentRefunds.invoiceId, invoiceIds) : sql`false`,
          and(
            isNull(paymentRefunds.paymentId),
            eq(paymentRefunds.studentId, studentId),
            between(paymentRefunds.createdAt, new Date(from), new Date(`${to}T23:59:59.999Z`))
          )
        )
      ]
    }),

  findById: (ctx, refundId) => refunds.findById(ctx.tenantId, refundId, { with: withDetails })
};
