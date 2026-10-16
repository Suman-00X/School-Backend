import { financePostings } from "../../ledger/index.js";
import { invoiceRepository } from "../repositories/invoice.repository.js";

const lineColumns = { lines: { columns: { feeHeadId: true, amount: true, description: true } } };

/* Post an invoice's change to the general ledger, inside the caller's transaction (the
   invoice is locked there). Re-read with its lines, so the books follow the saved invoice. */
export const postInvoice = async (ctx, invoiceId, kind, { dbc, note }) => {
  const invoice = await invoiceRepository.findById(ctx.tenantId, invoiceId, { with: lineColumns, dbc });
  return financePostings.syncInvoice(ctx, { invoice, lines: invoice.lines, kind, note }, { dbc });
};
