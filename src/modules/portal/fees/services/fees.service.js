import { notFound } from "../../../../common/http/errors.js";
import { invoiceService } from "../../../finance/invoices/index.js";
import { paymentService, receiptService } from "../../../finance/payments/index.js";
import { studentAccess } from "../../shared/services/studentAccess.service.js";

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
    return invoiceService.statement(ctx, studentId, query);
  },

  invoice: async (ctx, studentId, invoiceId) => {
    await ownInvoice(ctx, studentId, invoiceId);
    return invoiceService.getById(ctx, invoiceId);
  },

  startPayment: async (ctx, studentId, invoiceId) => {
    await ownInvoice(ctx, studentId, invoiceId);
    return paymentService.createOnlineOrder(ctx, invoiceId);
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
  }
};
