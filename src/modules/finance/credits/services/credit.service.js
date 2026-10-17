import { and, eq } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { fromMinor, toMinor } from "../../../../common/money/money.js";
import { invoiceService } from "../../invoices/index.js";
import { financePostings } from "../../ledger/index.js";
import { OPEN_INVOICE_STATUSES } from "../../shared/constants/finance.constants.js";
import { studentCreditBalances, studentCreditEntries } from "../models/studentCredit.schema.js";
import {
  creditBalanceRepository as balances,
  creditEntryRepository as entries
} from "../repositories/studentCredit.repository.js";

const balanceOf = async (ctx, studentId, { dbc } = {}) =>
  (await balances.findOne(ctx.tenantId, [eq(studentCreditBalances.studentId, studentId)], { dbc }))?.balance ?? 0;

const shortfall = available =>
  unprocessable(`The amount exceeds the available credit of ${Number(available).toFixed(2)}`);

/* A student's credit (advance): money received beyond an invoice's balance, kept to
   pay later invoices or to be paid back (D-21). The balance can never go negative. */
export const creditService = {
  /* For payments: keep the excess of a payment (inside the payment's transaction) */
  addOverpayment: async (ctx, { studentId, paymentId, amount, notes }, { dbc }) => {
    await entries.create(ctx.tenantId, { studentId, entryType: "OVERPAYMENT", amount, paymentId, notes }, { dbc });
    return balances.add(ctx.tenantId, studentId, amount, { dbc });
  },

  forStudent: async (ctx, studentId) => {
    const [balance, history] = await Promise.all([
      balanceOf(ctx, studentId),
      entries.findMany(ctx.tenantId, {
        conditions: [eq(studentCreditEntries.studentId, studentId)],
        with: { invoice: { columns: { id: true, invoiceNumber: true } } }
      })
    ]);
    return { studentId, balance, entries: history };
  },

  /* Use credit on an open invoice (default: as much as both allow) */
  applyToInvoice: async (ctx, invoiceId, { amount } = {}) => {
    const result = await transaction(async tx => {
      const invoice = await invoiceService.lockForUpdate(ctx.tenantId, invoiceId, { dbc: tx });
      if (!invoice) throw notFound("Invoice");
      if (!OPEN_INVOICE_STATUSES.includes(invoice.status)) {
        throw unprocessable(
          `${invoice.invoiceNumber} is ${invoice.status === "PAID" ? "already fully paid" : "cancelled"}`
        );
      }
      const available = await balanceOf(ctx, invoice.studentId, { dbc: tx });
      if (toMinor(available) <= 0) throw unprocessable("The student has no credit to apply");
      const applied = amount ?? fromMinor(Math.min(toMinor(available), toMinor(invoice.balance)));
      if (toMinor(applied) > toMinor(invoice.balance)) {
        throw unprocessable(`The amount exceeds the invoice balance of ${invoice.balance}`);
      }
      if (toMinor(applied) > toMinor(available)) throw shortfall(available);

      const remaining = await balances.take(ctx.tenantId, invoice.studentId, applied, { dbc: tx });
      if (remaining === null) throw shortfall(await balanceOf(ctx, invoice.studentId, { dbc: tx }));
      const entry = await entries.create(
        ctx.tenantId,
        { studentId: invoice.studentId, entryType: "APPLIED", amount: applied, invoiceId, createdBy: ctx.userId },
        { dbc: tx }
      );
      await invoiceService.applyPayment(ctx.tenantId, invoice, applied, { dbc: tx });
      await financePostings.creditApplied(ctx, { entry, invoice }, { dbc: tx });
      return { applied, remainingCredit: remaining };
    });
    return { ...result, invoice: await invoiceService.getById(ctx, invoiceId) };
  },

  /* For refunds (inside the refund's transaction) */
  balance: (ctx, studentId, { dbc } = {}) => balanceOf(ctx, studentId, { dbc }),

  /* Pay credit back in a refund (of a payment, or of the credit alone) -> remaining balance, or null if not enough */
  takeForRefund: async (ctx, { studentId, paymentId, amount, notes }, { dbc }) => {
    const remaining = await balances.take(ctx.tenantId, studentId, amount, { dbc });
    if (remaining === null) return null;
    await entries.create(
      ctx.tenantId,
      { studentId, entryType: "REFUNDED", amount, paymentId, method: "REFUND", notes, createdBy: ctx.userId ?? null },
      { dbc }
    );
    return remaining;
  },

  /* A refund failed at the gateway: its money is the student's again */
  restoreFromFailedRefund: async (ctx, { studentId, paymentId, amount, notes }, { dbc }) => {
    await entries.create(ctx.tenantId, { studentId, entryType: "REFUND_REVERSED", amount, paymentId, notes }, { dbc });
    return balances.add(ctx.tenantId, studentId, amount, { dbc });
  },

  /* For other submodules */
  appliedTo: (ctx, invoiceId) =>
    entries.findMany(ctx.tenantId, {
      conditions: [and(eq(studentCreditEntries.invoiceId, invoiceId), eq(studentCreditEntries.entryType, "APPLIED"))]
    })
};
