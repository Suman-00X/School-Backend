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

  startPayment: async (req, res) =>
    created(
      res,
      await feesService.startPayment(req.context, req.params.studentId, req.params.invoiceId),
      "Payment order created"
    ),

  confirmPayment: async (req, res) => {
    const payment = await feesService.confirmPayment(req.context, req.body);
    return ok(res, payment, `Payment confirmed. Receipt ${payment.receiptNumber}`);
  },

  receipt: async (req, res) => {
    const { buffer, fileName } = await feesService.receipt(req.context, req.params.paymentId);
    return sendFile(res, { buffer, fileName, format: "pdf" });
  }
};
