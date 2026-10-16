import { sendFile } from "../../../../common/export/exporters.js";
import { created, ok } from "../../../../common/http/responses.js";
import { feesService } from "../services/fees.service.js";

export const feesController = {
  statement: async (req, res) =>
    ok(
      res,
      await feesService.statement(req.context, req.params.studentId, req.query),
      "Fee statement retrieved successfully"
    ),

  invoice: async (req, res) =>
    ok(
      res,
      await feesService.invoice(req.context, req.params.studentId, req.params.invoiceId),
      "Invoice retrieved successfully"
    ),

  startPayment: async (req, res) => {
    const order = await feesService.startPayment(req.context, req.params.studentId, req.params.invoiceId, req.body);
    return created(res, order, `Payment order created for ${order.amount.toFixed(2)} of ${order.invoiceNumber}`);
  },

  confirmPayment: async (req, res) => {
    const payment = await feesService.confirmPayment(req.context, req.body);
    const credit = Number(payment.excessAmount);
    return ok(
      res,
      payment,
      `Payment confirmed. Receipt ${payment.receiptNumber}` +
        (credit > 0 ? `. ${credit.toFixed(2)} more than the balance is kept as credit` : "")
    );
  },

  receipt: async (req, res) => {
    const { buffer, fileName } = await feesService.receipt(req.context, req.params.paymentId);
    return sendFile(res, { buffer, fileName, format: "pdf" });
  }
};
