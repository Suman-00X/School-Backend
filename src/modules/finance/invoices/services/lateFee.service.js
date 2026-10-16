import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { fromMinor, toMinor } from "../../../../common/money/money.js";
import { getTenant, tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { todayIn } from "../../../../common/utils/date.util.js";
import { feeStructureService } from "../../fee-structures/index.js";
import { lateFeeRuleService } from "../../late-fee-rules/index.js";
import { OPEN_INVOICE_STATUSES } from "../../shared/constants/finance.constants.js";
import { lateFeeFor, statusFor } from "../../shared/utils/invoiceMath.util.js";
import { invoiceRepository } from "../repositories/invoice.repository.js";
import { invoiceService } from "./invoice.service.js";
import { postInvoice } from "./invoicePosting.service.js";

const netOf = invoice => toMinor(invoice.subtotal) - toMinor(invoice.discount);

/* Set the late fee of a locked invoice and post the difference to the ledger (kind:
   late-fee, late-fee-waived, late-fee-reinstated). It never drops below the part of it
   already paid, so the amount paid can never exceed the total. -> true when it changed */
const setLateFee = async (
  invoice,
  lateFee,
  changes,
  { dbc, ctx = { tenantId: invoice.tenantId }, kind = "late-fee", note }
) => {
  const feeMinor = Math.max(toMinor(lateFee), toMinor(invoice.amountPaid) - netOf(invoice));
  if (feeMinor === toMinor(invoice.lateFee) && !Object.keys(changes).length) return false;
  const total = fromMinor(netOf(invoice) + feeMinor);
  await invoiceRepository.update(
    invoice.tenantId,
    invoice.id,
    { ...changes, lateFee: fromMinor(feeMinor), total, status: statusFor(total, invoice.amountPaid) },
    { dbc }
  );
  await postInvoice(ctx, invoice.id, kind, { dbc, note });
  return true;
};

const lockOpen = async (ctx, invoiceId, tx) => {
  const invoice = await invoiceRepository.lockForUpdate(ctx.tenantId, invoiceId, { dbc: tx });
  if (!invoice) throw notFound("Invoice");
  if (!OPEN_INVOICE_STATUSES.includes(invoice.status)) {
    throw conflict(`${invoice.invoiceNumber} is ${invoice.status === "PAID" ? "fully paid" : "cancelled"}`);
  }
  return invoice;
};

export const lateFeeService = {
  /* Scheduled job (all schools): bring late fees up to date on open overdue invoices.
     The fee is a function of the days overdue, so running it again changes nothing. */
  applyLateFees: async () => {
    const candidates = await invoiceRepository.findLateFeeCandidates();
    const tenantIds = [...new Set(candidates.map(c => c.invoice.tenantId))];
    const ruleIds = [...new Set(candidates.map(c => c.structure.lateFeeRuleId).filter(Boolean))];
    const ruleFor = await lateFeeRuleService.resolverForJob(ruleIds, tenantIds);
    const todayByTenant = new Map();
    for (const tenantId of tenantIds)
      todayByTenant.set(tenantId, todayIn((await getTenant(tenantId))?.timezone ?? "UTC"));

    let updated = 0;
    for (const { invoice, structure } of candidates) {
      const lateFee = lateFeeFor(
        ruleFor(invoice.tenantId, structure),
        invoice.dueDate,
        todayByTenant.get(invoice.tenantId)
      );
      if (toMinor(lateFee) === toMinor(invoice.lateFee)) continue;
      /* Re-read under the lock: a payment or a waiver may have happened since the scan */
      const changed = await transaction(async tx => {
        const locked = await invoiceRepository.lockForUpdate(invoice.tenantId, invoice.id, { dbc: tx });
        if (!locked || !OPEN_INVOICE_STATUSES.includes(locked.status) || locked.lateFeeWaivedAt) return false;
        return setLateFee(locked, lateFee, {}, { dbc: tx });
      });
      if (changed) updated++;
    }
    return { checked: candidates.length, updated };
  },

  /* No late fee on this invoice, now or later. Refused when part of the late fee is already paid. */
  waive: async (ctx, invoiceId, { reason }) => {
    const waived = await transaction(async tx => {
      const invoice = await lockOpen(ctx, invoiceId, tx);
      if (invoice.lateFeeWaivedAt) throw conflict(`The late fee on ${invoice.invoiceNumber} is already waived`);
      const paidOfLateFee = toMinor(invoice.amountPaid) - netOf(invoice);
      if (paidOfLateFee > 0) {
        throw unprocessable(
          `${fromMinor(paidOfLateFee).toFixed(2)} of the late fee on ${invoice.invoiceNumber} is already paid; it can no longer be waived`
        );
      }
      await setLateFee(
        invoice,
        0,
        {
          lateFeeWaivedAt: new Date(),
          lateFeeWaivedBy: ctx.userId,
          lateFeeWaivedAmount: invoice.lateFee,
          lateFeeWaiverReason: reason
        },
        { dbc: tx, ctx, kind: "late-fee-waived", note: reason }
      );
      return invoice.lateFee;
    });
    return { invoice: await invoiceService.getById(ctx, invoiceId), waivedAmount: waived };
  },

  /* Undo a waiver: the late fee is charged again from today, under the structure's rule */
  reinstate: async (ctx, invoiceId) => {
    const today = await tenantToday(ctx.tenantId);
    await transaction(async tx => {
      const invoice = await lockOpen(ctx, invoiceId, tx);
      if (!invoice.lateFeeWaivedAt) throw conflict(`There is no late-fee waiver on ${invoice.invoiceNumber}`);
      const structure = await feeStructureService.getById(ctx, invoice.feeStructureId);
      const rule = await lateFeeRuleService.forStructure(ctx, structure);
      await setLateFee(
        invoice,
        lateFeeFor(rule, invoice.dueDate, today),
        { lateFeeWaivedAt: null, lateFeeWaivedBy: null, lateFeeWaivedAmount: 0, lateFeeWaiverReason: null },
        { dbc: tx, ctx, kind: "late-fee-reinstated" }
      );
    });
    return invoiceService.getById(ctx, invoiceId);
  }
};
