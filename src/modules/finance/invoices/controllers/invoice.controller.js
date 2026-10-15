import { created, ok, paginated } from "../../../../common/http/responses.js";
import { invoiceService } from "../services/invoice.service.js";

export const invoiceController = {
  generate: async (req, res) => {
    const result = await invoiceService.generate(req.context, req.body);
    return created(res, result, `${result.created} invoice(s) issued, ${result.skipped} already invoiced`);
  },

  list: async (req, res) =>
    paginated(res, await invoiceService.list(req.context, req.query), "Invoices retrieved successfully"),

  getById: async (req, res) =>
    ok(res, await invoiceService.getById(req.context, req.params.invoiceId), "Invoice retrieved successfully"),

  cancel: async (req, res) =>
    ok(res, await invoiceService.cancel(req.context, req.params.invoiceId, req.body), "Invoice cancelled successfully"),

  statement: async (req, res) =>
    ok(
      res,
      await invoiceService.statement(req.context, req.params.studentId, req.query),
      "Fee statement retrieved successfully"
    )
};
