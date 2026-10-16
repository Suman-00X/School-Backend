import { created, ok, paginated } from "../../../../common/http/responses.js";
import { invoiceService } from "../services/invoice.service.js";
import { invoiceIssuingService } from "../services/invoiceIssuing.service.js";
import { lateFeeService } from "../services/lateFee.service.js";

const amount = value => Number(value).toFixed(2);

export const invoiceController = {
  generate: async (req, res) => {
    const result = await invoiceIssuingService.generate(req.context, req.body);
    return created(
      res,
      result,
      `${result.created} invoice(s) issued through ${result.throughDate}, ${result.skipped} already invoiced`
    );
  },

  list: async (req, res) =>
    paginated(res, await invoiceService.list(req.context, req.query), "Invoices retrieved successfully"),

  getById: async (req, res) =>
    ok(res, await invoiceService.getById(req.context, req.params.invoiceId), "Invoice retrieved successfully"),

  cancel: async (req, res) =>
    ok(res, await invoiceService.cancel(req.context, req.params.invoiceId, req.body), "Invoice cancelled successfully"),

  waiveLateFee: async (req, res) => {
    const { invoice, waivedAmount } = await lateFeeService.waive(req.context, req.params.invoiceId, req.body);
    return ok(
      res,
      invoice,
      `Late fee of ${amount(waivedAmount)} waived on ${invoice.invoiceNumber}; no late fee will be charged on it`
    );
  },

  reinstateLateFee: async (req, res) => {
    const invoice = await lateFeeService.reinstate(req.context, req.params.invoiceId);
    return ok(res, invoice, `Late fee reinstated on ${invoice.invoiceNumber} (now ${amount(invoice.lateFee)})`);
  },

  statement: async (req, res) =>
    ok(
      res,
      await invoiceService.statement(req.context, req.params.studentId, req.query),
      "Fee statement retrieved successfully"
    )
};
