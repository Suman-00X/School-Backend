import { created, ok } from "../../../../common/http/responses.js";
import { creditService } from "../services/credit.service.js";

const amount = value => Number(value).toFixed(2);

export const creditController = {
  forStudent: async (req, res) =>
    ok(res, await creditService.forStudent(req.context, req.params.studentId), "Student credit retrieved successfully"),

  apply: async (req, res) => {
    const result = await creditService.applyToInvoice(req.context, req.params.invoiceId, req.body);
    return ok(
      res,
      result,
      `Credit of ${amount(result.applied)} applied to ${result.invoice.invoiceNumber}. Remaining credit ${amount(result.remainingCredit)}`
    );
  },

  refund: async (req, res) => {
    const entry = await creditService.refund(req.context, req.params.studentId, req.body);
    return created(
      res,
      entry,
      `Refund of ${amount(entry.amount)} recorded. Remaining credit ${amount(entry.remainingCredit)}`
    );
  }
};
