import { fromMinor, toMinor } from "../../../../common/money/money.js";
import { getTenant, tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { JOURNAL_SOURCES, METHOD_ACCOUNT_KEYS } from "../../shared/constants/finance.constants.js";
import { dateIn } from "../../shared/utils/date.util.js";
import { ledgerAccountService as chart } from "./account.service.js";
import { ledgerService } from "./ledger.service.js";

/* What the fee module posts to the general ledger, always inside the transaction of the
   business change, so the books and the records cannot disagree:

     invoice issued        Dr receivables (total) + Dr concessions / Cr fee income per head (gross) + Cr late fee
     invoice changed       the difference (late fee applied, recalculated, waived, reinstated)
     invoice cancelled     the reversal of everything it posted
     concessions changed   a reversal and a re-issue
     payment received      Dr cash / bank / gateway clearing / Cr receivables (+ Cr student credit for any excess)
     credit applied        Dr student credit / Cr receivables
     credit paid back      Dr student credit / Cr cash or bank
     refund                Dr receivables / student credit (its split) / Cr gateway clearing, cash or bank
     refund failed         its reversal

   Concessions are posted gross: fee income shows what was charged, the concessions account
   what was given up, so the income summary can show both. */

const { INVOICE, PAYMENT, REFUND, STUDENT_CREDIT } = JOURNAL_SOURCES;

const money = minor => fromMinor(minor).toFixed(2);
const methodAccount = method => ({ key: METHOD_ACCOUNT_KEYS[method] ?? "BANK" });

/* Events that happen once in an invoice's life; the others are numbered (late-fee:3) */
const ONCE = new Set(["issued", "cancelled"]);

/* What an invoice should have posted, per account (paise, debit positive). Cancelled: nothing. */
const invoiceTarget = (invoice, lines) => {
  if (invoice.status === "CANCELLED") return [];
  return [
    {
      ref: { key: "RECEIVABLES" },
      studentId: invoice.studentId,
      minor: toMinor(invoice.total),
      memo: invoice.invoiceNumber
    },
    ...lines.map(line => ({
      ref: { feeHeadId: line.feeHeadId },
      minor: -toMinor(line.amount),
      memo: line.description
    })),
    { ref: { key: "CONCESSIONS" }, minor: toMinor(invoice.discount) },
    { ref: { key: "LATE_FEE_INCOME" }, minor: -toMinor(invoice.lateFee) }
  ];
};

/* Signed paise per account -> journal lines */
const toLines = rows =>
  rows
    .filter(row => row.minor !== 0)
    .map(row => ({
      account: row.ref,
      studentId: row.studentId ?? null,
      memo: row.memo ?? null,
      debit: row.minor > 0 ? fromMinor(row.minor) : 0,
      credit: row.minor < 0 ? fromMinor(-row.minor) : 0
    }));

/* Group by account and student -> [{ ref: { accountId }, studentId, minor }] */
const byAccount = async (tenantId, rows) => {
  const totals = new Map();
  for (const row of rows) {
    const accountId = row.ref.accountId ?? (await chart.resolve(tenantId, row.ref));
    const key = `${accountId}:${row.studentId ?? ""}`;
    const entry = totals.get(key) ?? { ref: { accountId }, studentId: row.studentId ?? null, minor: 0, memo: row.memo };
    entry.minor += row.minor;
    totals.set(key, entry);
  }
  return [...totals.values()];
};

const NARRATIONS = {
  issued: (invoice, note) =>
    `Invoice ${invoice.invoiceNumber} issued, due ${invoice.dueDate}${note ? ` (${note})` : ""}`,
  cancelled: (invoice, note) => `Invoice ${invoice.invoiceNumber} cancelled${note ? `: ${note}` : ""}`,
  "late-fee": invoice => `Late fee on ${invoice.invoiceNumber} brought to ${Number(invoice.lateFee).toFixed(2)}`,
  "late-fee-waived": (invoice, note) => `Late fee on ${invoice.invoiceNumber} waived${note ? `: ${note}` : ""}`,
  "late-fee-reinstated": invoice =>
    `Late-fee waiver on ${invoice.invoiceNumber} withdrawn (late fee ${Number(invoice.lateFee).toFixed(2)})`,
  reversed: invoice => `Invoice ${invoice.invoiceNumber} reversed for recalculation (concessions changed)`,
  reissued: invoice => `Invoice ${invoice.invoiceNumber} re-issued with the new concessions`
};

export const financePostings = {
  /* Bring an invoice's postings in line with the invoice (locked by the caller), posting the
     difference. kind: issued | cancelled | late-fee | late-fee-waived | late-fee-reinstated |
     recalculated (a full reversal, then the invoice as it is now). Posts nothing when the
     books already agree. lines: the invoice's lines ({ feeHeadId, amount, description }). */
  syncInvoice: async (ctx, { invoice, lines, kind, note }, { dbc }) => {
    const target = await byAccount(ctx.tenantId, invoiceTarget(invoice, lines));
    const posted = (await ledgerService.postedBy(ctx, INVOICE, invoice.id, { dbc })).map(row => ({
      ref: { accountId: row.accountId },
      studentId: row.studentId,
      minor: row.netMinor
    }));
    const count = await ledgerService.entriesOf(ctx, INVOICE, invoice.id, { dbc });
    const date = kind === "issued" ? invoice.issueDate : await tenantToday(ctx.tenantId);
    const post = (event, narrationKind, rows) =>
      ledgerService.post(
        ctx,
        {
          date,
          narration: NARRATIONS[narrationKind](invoice, note),
          sourceType: INVOICE,
          sourceId: invoice.id,
          event,
          lines: toLines(rows)
        },
        { dbc }
      );

    if (kind === "recalculated") {
      const reversal = posted.map(row => ({ ...row, minor: -row.minor }));
      await post(`reversed:${count + 1}`, "reversed", await byAccount(ctx.tenantId, reversal));
      return post(`reissued:${count + 2}`, "reissued", target);
    }
    const difference = await byAccount(ctx.tenantId, [
      ...target,
      ...posted.map(row => ({ ...row, minor: -row.minor }))
    ]);
    return post(ONCE.has(kind) ? kind : `${kind}:${count + 1}`, kind, difference);
  },

  /* A successful payment: applied to the invoice, any excess kept as credit */
  paymentReceived: async (ctx, { payment, invoice, appliedMinor }, { dbc }) => {
    const tenant = await getTenant(ctx.tenantId);
    const excessMinor = toMinor(payment.amount) - appliedMinor;
    return ledgerService.post(
      ctx,
      {
        date: dateIn(tenant?.timezone ?? "UTC", payment.paidAt ?? new Date()),
        narration:
          `Payment ${payment.receiptNumber} received for ${invoice.invoiceNumber} (${payment.method})` +
          (excessMinor > 0 ? `, ${money(excessMinor)} kept as credit` : ""),
        sourceType: PAYMENT,
        sourceId: payment.id,
        event: "received",
        lines: [
          { account: methodAccount(payment.method), debit: payment.amount, memo: payment.reference ?? null },
          {
            account: { key: "RECEIVABLES" },
            credit: fromMinor(appliedMinor),
            studentId: payment.studentId,
            memo: invoice.invoiceNumber
          },
          { account: { key: "STUDENT_CREDIT" }, credit: fromMinor(excessMinor), studentId: payment.studentId }
        ]
      },
      { dbc }
    );
  },

  creditApplied: (ctx, { entry, invoice }, { dbc }) =>
    ledgerService.post(
      ctx,
      {
        narration: `Student credit of ${Number(entry.amount).toFixed(2)} applied to ${invoice.invoiceNumber}`,
        sourceType: STUDENT_CREDIT,
        sourceId: entry.id,
        event: "applied",
        lines: [
          { account: { key: "STUDENT_CREDIT" }, debit: entry.amount, studentId: entry.studentId },
          {
            account: { key: "RECEIVABLES" },
            credit: entry.amount,
            studentId: entry.studentId,
            memo: invoice.invoiceNumber
          }
        ]
      },
      { dbc }
    ),

  creditRefunded: (ctx, { entry }, { dbc }) =>
    ledgerService.post(
      ctx,
      {
        narration: `Student credit of ${Number(entry.amount).toFixed(2)} paid back (${entry.method}${entry.reference ? ` ${entry.reference}` : ""})`,
        sourceType: STUDENT_CREDIT,
        sourceId: entry.id,
        event: "refunded",
        lines: [
          { account: { key: "STUDENT_CREDIT" }, debit: entry.amount, studentId: entry.studentId },
          { account: methodAccount(entry.method), credit: entry.amount, memo: entry.reference ?? null }
        ]
      },
      { dbc }
    ),

  /* Money paid back from a payment (processed, or pending at the gateway) */
  refundExecuted: (ctx, { refund, receiptNumber }, { dbc }) =>
    ledgerService.post(
      ctx,
      {
        narration:
          `Refund ${refund.refundNumber} of payment ${receiptNumber}` +
          (refund.status === "PENDING" ? " (pending at the payment gateway)" : ""),
        sourceType: REFUND,
        sourceId: refund.id,
        event: "refunded",
        lines: [
          { account: { key: "RECEIVABLES" }, debit: refund.fromInvoice, studentId: refund.studentId },
          { account: { key: "STUDENT_CREDIT" }, debit: refund.fromCredit, studentId: refund.studentId },
          { account: { key: "REFUND_SUSPENSE" }, debit: refund.unallocated, studentId: refund.studentId },
          {
            account: methodAccount(refund.method),
            credit: refund.amount,
            memo: refund.gatewayRefundId ?? refund.reference ?? null
          }
        ]
      },
      { dbc }
    ),

  /* The gateway could not pay a refund out: the money is back with the school. What it took
     from the invoice goes back there while the invoice still owes it, the rest to credit. */
  refundFailed: async (ctx, { refund, backOnInvoiceMinor, toCreditMinor }, { dbc }) => {
    const executed = await ledgerService.entryFor(ctx, REFUND, refund.id, "refunded", { dbc });
    return ledgerService.post(
      ctx,
      {
        narration: `Refund ${refund.refundNumber} failed at the payment gateway; reversed`,
        sourceType: REFUND,
        sourceId: refund.id,
        event: "failed",
        reversalOfId: executed?.id,
        lines: [
          { account: methodAccount(refund.method), debit: refund.amount, memo: refund.gatewayRefundId ?? null },
          { account: { key: "RECEIVABLES" }, credit: fromMinor(backOnInvoiceMinor), studentId: refund.studentId },
          { account: { key: "STUDENT_CREDIT" }, credit: fromMinor(toCreditMinor), studentId: refund.studentId },
          { account: { key: "REFUND_SUSPENSE" }, credit: refund.unallocated, studentId: refund.studentId }
        ]
      },
      { dbc }
    );
  }
};
