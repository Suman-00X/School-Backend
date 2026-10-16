import { notFound } from "../../../../common/http/errors.js";
import { invoiceService } from "../../../finance/invoices/index.js";
import {
  paymentService,
  receiptService,
  refundReceiptService,
  refundService
} from "../../../finance/payments/index.js";
import { studentAccess } from "../../shared/services/studentAccess.service.js";

/* Refund requests and rejections are the school's own deliberation; families see refunds once approved */
const FAMILY_REFUND_STATUSES = ["PENDING", "PROCESSED", "FAILED"];

/* The invoice, if it belongs to a student the caller may see */
const ownInvoice = async (ctx, studentId, invoiceId) => {
  await studentAccess.assert(ctx, studentId);
  const invoice = await invoiceService.findById(ctx, invoiceId);
  if (!invoice || invoice.studentId !== studentId) throw notFound("Invoice");
  return invoice;
};

export const feesService = {
  statement: async (ctx, studentId, query) => {
    await studentAccess.assert(ctx, studentId);
    const statement = await invoiceService.statement(ctx, studentId, query);
    return { ...statement, refunds: statement.refunds.filter(r => FAMILY_REFUND_STATUSES.includes(r.status)) };
  },

  invoice: async (ctx, studentId, invoiceId) => {
    await ownInvoice(ctx, studentId, invoiceId);
    return invoiceService.getById(ctx, invoiceId);
  },

  startPayment: async (ctx, studentId, invoiceId, { amount } = {}) => {
    await ownInvoice(ctx, studentId, invoiceId);
    return paymentService.createOnlineOrder(ctx, invoiceId, { amount });
  },

  confirmPayment: async (ctx, body) => {
    const payment = await paymentService.confirmOnline(ctx, body);
    await studentAccess.assert(ctx, payment.studentId);
    return payment;
  },

  receipt: async (ctx, paymentId) => {
    const payment = await paymentService.getById(ctx, paymentId);
    await studentAccess.assert(ctx, payment.studentId);
    return receiptService.pdf(ctx, paymentId);
  },

  /* A refund receipt of one's own child (404 for other families' refunds and for requests) */
  refundReceipt: async (ctx, refundId) => {
    const refund = await refundService.findById(ctx, refundId);
    if (!refund || !FAMILY_REFUND_STATUSES.includes(refund.status)) throw notFound("Refund");
    await studentAccess.assert(ctx, refund.studentId);
    return refundReceiptService.pdf(ctx, refundId);
  }
};
